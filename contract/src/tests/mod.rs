#![cfg(test)]

use crate::contract::{TicketContract, TicketContractClient};
use soroban_sdk::{symbol_short, testutils, Address, Env, Vec};

fn setup() -> (Env, Address) {
    let env = Env::default();
    let contract_id = <Address as testutils::Address>::generate(&env);
    env.mock_all_auths();

    env.register_contract(&contract_id, TicketContract);

    (env, contract_id)
}

#[test]
fn test_issue_ticket() {
    let (env, contract_id) = setup();
    let client = TicketContractClient::new(&env, &contract_id);

    let ticket_id = symbol_short!("TICKET1");
    let event_id = symbol_short!("EVENT1");
    let owner = <Address as testutils::Address>::generate(&env);

    let ticket = client.issue_ticket(&ticket_id, &event_id, &owner);

    assert_eq!(ticket.id, ticket_id);
    assert_eq!(ticket.event_id, event_id);
    assert_eq!(ticket.owner, owner);
    assert!(!ticket.is_used);
}

#[test]
fn test_get_ticket_existing() {
    let (env, contract_id) = setup();
    let client = TicketContractClient::new(&env, &contract_id);

    let ticket_id = symbol_short!("TICKET2");
    let event_id = symbol_short!("EVENT2");
    let owner = <Address as testutils::Address>::generate(&env);

    client.issue_ticket(&ticket_id, &event_id, &owner);
    let retrieved = client.get_ticket(&ticket_id);

    assert!(retrieved.is_some());
}

#[test]
fn test_transfer_unauthorized() {
    let (env, contract_id) = setup();
    let client = TicketContractClient::new(&env, &contract_id);

    let ticket_id = symbol_short!("TICKETX");
    let event_id = symbol_short!("EVENTX");
    let owner = <Address as testutils::Address>::generate(&env);
    let attacker = <Address as testutils::Address>::generate(&env);

    client.issue_ticket(&ticket_id, &event_id, &owner);

    let result = std::panic::catch_unwind(|| {
        client.transfer_ticket(&ticket_id, &attacker, &owner);
    });

    assert!(result.is_err());
}

#[test]
fn test_multisig_escrow_success() {
    let (env, contract_id) = setup();
    let client = TicketContractClient::new(&env, &contract_id);

    let event_id = symbol_short!("E1");
    let signer1 = <Address as testutils::Address>::generate(&env);
    let signer2 = <Address as testutils::Address>::generate(&env);
    let destination = <Address as testutils::Address>::generate(&env);

    let mut signers = Vec::new(&env);
    signers.push_back(signer1.clone());
    signers.push_back(signer2.clone());

    client.set_escrow_signers(&event_id, &signers, &2);
    client.approve_release(&event_id, &signer1);
    client.approve_release(&event_id, &signer2);

    client.distribute_escrow(&event_id, &destination);
}

#[test]
#[should_panic(expected = "Threshold not met")]
fn test_multisig_escrow_threshold_not_met() {
    let (env, contract_id) = setup();
    let client = TicketContractClient::new(&env, &contract_id);

    let event_id = symbol_short!("E2");
    let signer1 = <Address as testutils::Address>::generate(&env);
    let signer2 = <Address as testutils::Address>::generate(&env);
    let destination = <Address as testutils::Address>::generate(&env);

    let mut signers = Vec::new(&env);
    signers.push_back(signer1.clone());
    signers.push_back(signer2.clone());

    client.set_escrow_signers(&event_id, &signers, &2);
    client.approve_release(&event_id, &signer1);

    client.distribute_escrow(&event_id, &destination);
}

#[test]
fn test_is_ticket_owner_correct_owner() {
    let (env, contract_id) = setup();

    let ticket_id = symbol_short!("TICKET9");
    let event_id = symbol_short!("EVENT9");
    let owner = <Address as testutils::Address>::generate(&env);

    env.as_contract(&contract_id, || {
        TicketContract::issue_ticket(env.clone(), ticket_id.clone(), event_id, owner.clone());
        assert!(TicketContract::is_ticket_owner(env.clone(), ticket_id, owner));
    });
}

#[test]
fn test_get_ticket_status_after_transfer() {
    let (env, contract_id) = setup();

    let ticket_id = symbol_short!("TICKETD");
    let event_id = symbol_short!("EVENTD");
    let owner = <Address as testutils::Address>::generate(&env);
    let new_owner = <Address as testutils::Address>::generate(&env);

    env.as_contract(&contract_id, || {
        TicketContract::issue_ticket(env.clone(), ticket_id.clone(), event_id, owner.clone());
        TicketContract::transfer_ticket(
            env.clone(),
            ticket_id.clone(),
            owner.clone(),
            new_owner.clone(),
        );

        let (status_owner, is_used) =
            TicketContract::get_ticket_status(env.clone(), ticket_id);

        assert_eq!(status_owner, new_owner);
        assert!(!is_used);
    });
}