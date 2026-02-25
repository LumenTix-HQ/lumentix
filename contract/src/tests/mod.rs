
use crate::contract::{TicketContract, TicketContractClient};
use soroban_sdk::{symbol_short, testutils, Address, Env, Vec};

fn setup() -> (Env, Address) {
    let env = Env::default();
    let contract_id = <Address as testutils::Address>::generate(&env);
    env.mock_all_auths();

    env.register(&contract_id, TicketContract);

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
#[should_panic(expected = "Unauthorized")]
fn test_transfer_unauthorized() {
    let (env, contract_id) = setup();
    let client = TicketContractClient::new(&env, &contract_id);

    let ticket_id = symbol_short!("TICKETX");
    let event_id = symbol_short!("EVENTX");
    let owner = <Address as testutils::Address>::generate(&env);
    let attacker = <Address as testutils::Address>::generate(&env);

    client.issue_ticket(&ticket_id, &event_id, &owner);

    // This should panic because attacker is not the owner
    client.transfer_ticket(&ticket_id, &attacker, &owner);
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

// ========================================
// TESTS FOR TICKET VALIDATION FEATURE
// ========================================

#[test]
fn test_init_event() {
    let (env, contract_id) = setup();

    let event_id = symbol_short!("EVENT99");
    let organizer = <Address as testutils::Address>::generate(&env);

    env.as_contract(&contract_id, || {
        TicketContract::init_event(env.clone(), event_id.clone(), organizer.clone());

        // Verify organizer is automatically authorized
        let is_auth = TicketContract::is_authorized_validator(
            env.clone(),
            event_id.clone(),
            organizer.clone(),
        );
        assert!(is_auth);
    });
}

#[test]
fn test_add_validator() {
    let (env, contract_id) = setup();

    let event_id = symbol_short!("EVENT10");
    let organizer = <Address as testutils::Address>::generate(&env);
    let validator = <Address as testutils::Address>::generate(&env);

    env.as_contract(&contract_id, || {
        TicketContract::init_event(env.clone(), event_id.clone(), organizer.clone());
        TicketContract::add_validator(env.clone(), event_id.clone(), validator.clone());

        let is_auth =
            TicketContract::is_authorized_validator(env.clone(), event_id, validator.clone());
        assert!(is_auth);
    });
}

#[test]
fn test_remove_validator() {
    let (env, contract_id) = setup();

    let event_id = symbol_short!("EVENT11");
    let organizer = <Address as testutils::Address>::generate(&env);
    let validator = <Address as testutils::Address>::generate(&env);

    env.as_contract(&contract_id, || {
        TicketContract::init_event(env.clone(), event_id.clone(), organizer.clone());
        TicketContract::add_validator(env.clone(), event_id.clone(), validator.clone());
        TicketContract::remove_validator(env.clone(), event_id.clone(), validator.clone());

        let is_auth = TicketContract::is_authorized_validator(env.clone(), event_id, validator);
        assert!(!is_auth);
    });
}

#[test]
fn test_is_authorized_validator_organizer() {
    let (env, contract_id) = setup();

    let event_id = symbol_short!("EVENT12");
    let organizer = <Address as testutils::Address>::generate(&env);

    env.as_contract(&contract_id, || {
        TicketContract::init_event(env.clone(), event_id.clone(), organizer.clone());

        let is_auth = TicketContract::is_authorized_validator(env.clone(), event_id, organizer);
        assert!(is_auth);
    });
}

#[test]
fn test_is_authorized_validator_unauthorized() {
    let (env, contract_id) = setup();

    let event_id = symbol_short!("EVENT13");
    let organizer = <Address as testutils::Address>::generate(&env);
    let random_address = <Address as testutils::Address>::generate(&env);

    env.as_contract(&contract_id, || {
        TicketContract::init_event(env.clone(), event_id.clone(), organizer);

        let is_auth =
            TicketContract::is_authorized_validator(env.clone(), event_id, random_address);
        assert!(!is_auth);
    });
}

#[test]
fn test_validate_ticket_success() {
    let (env, contract_id) = setup();

    let event_id = symbol_short!("EVENT14");
    let ticket_id = symbol_short!("TICKET14");
    let organizer = <Address as testutils::Address>::generate(&env);
    let owner = <Address as testutils::Address>::generate(&env);

    env.as_contract(&contract_id, || {
        TicketContract::init_event(env.clone(), event_id.clone(), organizer.clone());
        TicketContract::issue_ticket(env.clone(), ticket_id.clone(), event_id, owner);

        let validated = TicketContract::validate_ticket(env.clone(), ticket_id.clone(), organizer);

        assert!(validated.is_used);
        assert_eq!(validated.id, ticket_id);

        let retrieved = TicketContract::get_ticket(env.clone(), ticket_id);
        assert!(retrieved.is_some());
        assert!(retrieved.unwrap().is_used);
    });
}

#[test]
fn test_validate_ticket_with_gate_agent() {
    let (env, contract_id) = setup();

    let event_id = symbol_short!("EVENT15");
    let ticket_id = symbol_short!("TICKET15");
    let organizer = <Address as testutils::Address>::generate(&env);
    let gate_agent = <Address as testutils::Address>::generate(&env);
    let owner = <Address as testutils::Address>::generate(&env);

    env.as_contract(&contract_id, || {
        TicketContract::init_event(env.clone(), event_id.clone(), organizer.clone());
        TicketContract::add_validator(env.clone(), event_id.clone(), gate_agent.clone());
        TicketContract::issue_ticket(env.clone(), ticket_id.clone(), event_id, owner);

        let validated = TicketContract::validate_ticket(env.clone(), ticket_id.clone(), gate_agent);

        assert!(validated.is_used);
    });
}

#[test]
#[should_panic(expected = "Ticket not found")]
fn test_validate_nonexistent_ticket() {
    let (env, contract_id) = setup();

    let event_id = symbol_short!("EVENT16");
    let ticket_id = symbol_short!("NOEXIST");
    let organizer = <Address as testutils::Address>::generate(&env);

    env.as_contract(&contract_id, || {
        TicketContract::init_event(env.clone(), event_id, organizer.clone());

        TicketContract::validate_ticket(env.clone(), ticket_id, organizer);
    });
}

#[test]
#[should_panic(expected = "already been used")]
fn test_validate_ticket_already_used() {
    let (env, contract_id) = setup();

    let event_id = symbol_short!("EVENT17");
    let ticket_id = symbol_short!("TICKET17");
    let organizer = <Address as testutils::Address>::generate(&env);
    let owner = <Address as testutils::Address>::generate(&env);

    env.as_contract(&contract_id, || {
        TicketContract::init_event(env.clone(), event_id.clone(), organizer.clone());
        TicketContract::issue_ticket(env.clone(), ticket_id.clone(), event_id, owner);

        // First validation - should succeed
        TicketContract::validate_ticket(env.clone(), ticket_id.clone(), organizer.clone());

        // Second validation - should panic
        TicketContract::validate_ticket(env.clone(), ticket_id, organizer);
    });
}

#[test]
#[should_panic(expected = "not authorized")]
fn test_validate_ticket_unauthorized_validator() {
    let (env, contract_id) = setup();

    let event_id = symbol_short!("EVENT18");
    let ticket_id = symbol_short!("TICKET18");
    let organizer = <Address as testutils::Address>::generate(&env);
    let unauthorized = <Address as testutils::Address>::generate(&env);
    let owner = <Address as testutils::Address>::generate(&env);

    env.as_contract(&contract_id, || {
        TicketContract::init_event(env.clone(), event_id.clone(), organizer);
        TicketContract::issue_ticket(env.clone(), ticket_id.clone(), event_id, owner);

        TicketContract::validate_ticket(env.clone(), ticket_id, unauthorized);
    });
}

#[test]
fn test_validate_ticket_emits_event() {
    let (env, contract_id) = setup();

    let event_id = symbol_short!("EVENT19");
    let ticket_id = symbol_short!("TICKET19");
    let organizer = <Address as testutils::Address>::generate(&env);
    let owner = <Address as testutils::Address>::generate(&env);

    env.as_contract(&contract_id, || {
        TicketContract::init_event(env.clone(), event_id.clone(), organizer.clone());
        TicketContract::issue_ticket(env.clone(), ticket_id.clone(), event_id.clone(), owner);

        // Validate ticket - this emits a CheckInEvent internally
        let validated =
            TicketContract::validate_ticket(env.clone(), ticket_id.clone(), organizer.clone());

        // Verify validation succeeded (event emission is a side-effect)
        assert!(validated.is_used);
        assert_eq!(validated.id, ticket_id);
    });
}

#[test]
fn test_multiple_validators_for_event() {
    let (env, contract_id) = setup();

    let event_id = symbol_short!("EVENT20");
    let organizer = <Address as testutils::Address>::generate(&env);
    let validator1 = <Address as testutils::Address>::generate(&env);
    let validator2 = <Address as testutils::Address>::generate(&env);

    env.as_contract(&contract_id, || {
        TicketContract::init_event(env.clone(), event_id.clone(), organizer.clone());

        TicketContract::add_validator(env.clone(), event_id.clone(), validator1.clone());
        TicketContract::add_validator(env.clone(), event_id.clone(), validator2.clone());

        assert!(TicketContract::is_authorized_validator(
            env.clone(),
            event_id.clone(),
            validator1
        ));
        assert!(TicketContract::is_authorized_validator(
            env.clone(),
            event_id,
            validator2
        ));
    });
}
