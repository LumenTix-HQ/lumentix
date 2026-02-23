use crate::contract::{TicketContract, TicketContractClient};
use crate::models::Ticket;
use soroban_sdk::{symbol_short, testutils, Address, Env, Vec};

fn setup() -> (Env, Address) {
    let env = Env::default();
    let contract_id = <Address as testutils::Address>::generate(&env);
    env.mock_all_auths();

    // Register the test contract
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
    let ticket = retrieved.unwrap();
    assert_eq!(ticket.id, ticket_id);
    assert_eq!(ticket.event_id, event_id);
    assert_eq!(ticket.owner, owner);
}

#[test]
fn test_get_ticket_nonexistent() {
    let (env, contract_id) = setup();
    let client = TicketContractClient::new(&env, &contract_id);
    let nonexistent_id = symbol_short!("NOEXIST");

    let result = client.get_ticket(&nonexistent_id);
    assert!(result.is_none());
}

#[test]
fn test_mark_ticket_used() {
    let (env, contract_id) = setup();
    let client = TicketContractClient::new(&env, &contract_id);

    let ticket_id = symbol_short!("TICKET3");
    let event_id = symbol_short!("EVENT3");
    let owner = <Address as testutils::Address>::generate(&env);

    client.issue_ticket(&ticket_id, &event_id, &owner);
    let marked = client.mark_ticket_used(&ticket_id);

    assert!(marked.is_used);
    assert_eq!(marked.id, ticket_id);

    let retrieved = client.get_ticket(&ticket_id);
    assert!(retrieved.unwrap().is_used);
}

#[test]
fn test_transfer_ticket() {
    let (env, contract_id) = setup();
    let client = TicketContractClient::new(&env, &contract_id);

    let ticket_id = symbol_short!("TICKET4");
    let event_id = symbol_short!("EVENT4");
    let owner = <Address as testutils::Address>::generate(&env);
    let new_owner = <Address as testutils::Address>::generate(&env);

    client.issue_ticket(&ticket_id, &event_id, &owner);
    let transferred = client.transfer_ticket(&ticket_id, &owner, &new_owner);

    assert_eq!(transferred.owner, new_owner);
    let retrieved = client.get_ticket(&ticket_id);
    assert_eq!(retrieved.unwrap().owner, new_owner);
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
    
    let event_id = symbol_short!("E1");
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
#[should_panic(expected = "Threshold not met")]
fn test_multisig_escrow_revocation() {
    let (env, contract_id) = setup();
    let client = TicketContractClient::new(&env, &contract_id);
    
    let event_id = symbol_short!("E2");
    let signer1 = <Address as testutils::Address>::generate(&env);
    let destination = <Address as testutils::Address>::generate(&env);

    let mut signers = Vec::new(&env);
    signers.push_back(signer1.clone());

    client.set_escrow_signers(&event_id, &signers, &1);
    client.approve_release(&event_id, &signer1);
    client.revoke_approval(&event_id, &signer1);
    client.distribute_escrow(&event_id, &destination);
}
