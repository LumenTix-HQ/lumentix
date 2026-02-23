#![cfg(test)]

use crate::TicketContract;
use soroban_sdk::{symbol_short, testutils, Address, Env};

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

    let ticket_id = symbol_short!("TICKET1");
    let event_id = symbol_short!("EVENT1");
    let owner = <Address as testutils::Address>::generate(&env);

    let ticket = env.as_contract(&contract_id, || {
        TicketContract::issue_ticket(
            env.clone(),
            ticket_id.clone(),
            event_id.clone(),
            owner.clone(),
        )
    });

    assert_eq!(ticket.id, ticket_id);
    assert_eq!(ticket.event_id, event_id);
    assert_eq!(ticket.owner, owner);
    assert!(!ticket.is_used);
}

#[test]
fn test_get_ticket_existing() {
    let (env, contract_id) = setup();

    let ticket_id = symbol_short!("TICKET2");
    let event_id = symbol_short!("EVENT2");
    let owner = <Address as testutils::Address>::generate(&env);

    env.as_contract(&contract_id, || {
        // Issue a ticket
        TicketContract::issue_ticket(
            env.clone(),
            ticket_id.clone(),
            event_id.clone(),
            owner.clone(),
        );

        // Retrieve it
        let retrieved = TicketContract::get_ticket(env.clone(), ticket_id.clone());

        assert!(retrieved.is_some());
        let ticket = retrieved.unwrap();
        assert_eq!(ticket.id, ticket_id);
        assert_eq!(ticket.event_id, event_id);
        assert_eq!(ticket.owner, owner);
    });
}

#[test]
fn test_get_ticket_nonexistent() {
    let (env, contract_id) = setup();

    let nonexistent_id = symbol_short!("NOEXIST");

    env.as_contract(&contract_id, || {
        let result = TicketContract::get_ticket(env.clone(), nonexistent_id);
        assert!(result.is_none());
    });
}

#[test]
fn test_mark_ticket_used() {
    let (env, contract_id) = setup();

    let ticket_id = symbol_short!("TICKET3");
    let event_id = symbol_short!("EVENT3");
    let owner = <Address as testutils::Address>::generate(&env);

    env.as_contract(&contract_id, || {
        // Issue a ticket
        TicketContract::issue_ticket(env.clone(), ticket_id.clone(), event_id, owner.clone());

        // Mark it as used
        let marked = TicketContract::mark_ticket_used(env.clone(), ticket_id.clone());

        assert!(marked.is_used);
        assert_eq!(marked.id, ticket_id);

        // Verify persistence
        let retrieved = TicketContract::get_ticket(env.clone(), ticket_id.clone());
        assert!(retrieved.is_some());
        assert!(retrieved.unwrap().is_used);
    });
}

#[test]
fn test_transfer_ticket() {
    let (env, contract_id) = setup();

    let ticket_id = symbol_short!("TICKET4");
    let event_id = symbol_short!("EVENT4");
    let owner = <Address as testutils::Address>::generate(&env);
    let new_owner = <Address as testutils::Address>::generate(&env);

    env.as_contract(&contract_id, || {
        // Issue a ticket
        TicketContract::issue_ticket(env.clone(), ticket_id.clone(), event_id, owner.clone());

        // Transfer it
        let transferred = TicketContract::transfer_ticket(
            env.clone(),
            ticket_id.clone(),
            owner.clone(),
            new_owner.clone(),
        );

        assert_eq!(transferred.owner, new_owner);
        assert_eq!(transferred.id, ticket_id);
        assert!(!transferred.is_used);

        // Verify persistence
        let retrieved = TicketContract::get_ticket(env.clone(), ticket_id);
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().owner, new_owner);
    });
}

#[test]
fn test_chain_transfers() {
    let (env, contract_id) = setup();

    let ticket_id = symbol_short!("TICKET5");
    let event_id = symbol_short!("EVENT5");
    let owner1 = <Address as testutils::Address>::generate(&env);
    let owner2 = <Address as testutils::Address>::generate(&env);
    let owner3 = <Address as testutils::Address>::generate(&env);

    env.as_contract(&contract_id, || {
        // Issue ticket to owner1
        TicketContract::issue_ticket(env.clone(), ticket_id.clone(), event_id, owner1.clone());

        // Transfer owner1 -> owner2
        TicketContract::transfer_ticket(
            env.clone(),
            ticket_id.clone(),
            owner1.clone(),
            owner2.clone(),
        );

        // Transfer owner2 -> owner3
        TicketContract::transfer_ticket(
            env.clone(),
            ticket_id.clone(),
            owner2.clone(),
            owner3.clone(),
        );

        // Verify final owner
        let final_ticket = TicketContract::get_ticket(env.clone(), ticket_id);
        assert!(final_ticket.is_some());
        let ticket = final_ticket.unwrap();
        assert_eq!(ticket.owner, owner3);
        assert!(!ticket.is_used);
    });
}

#[test]
fn test_ticket_immutability() {
    let (env, contract_id) = setup();

    let ticket_id = symbol_short!("TICKET6");
    let event_id = symbol_short!("EVENT6");
    let owner1 = <Address as testutils::Address>::generate(&env);
    let owner2 = <Address as testutils::Address>::generate(&env);

    env.as_contract(&contract_id, || {
        // Issue ticket
        let original = TicketContract::issue_ticket(
            env.clone(),
            ticket_id.clone(),
            event_id.clone(),
            owner1.clone(),
        );

        // Transfer it
        let transferred = TicketContract::transfer_ticket(
            env.clone(),
            ticket_id.clone(),
            owner1.clone(),
            owner2.clone(),
        );

        // ID and event_id should not change
        assert_eq!(original.id, transferred.id);
        assert_eq!(original.event_id, transferred.event_id);

        // Owner should change
        assert_ne!(original.owner, transferred.owner);
        assert_eq!(transferred.owner, owner2);
    });
}

#[test]
#[should_panic(expected = "Unauthorized: not the ticket owner")]
fn test_transfer_unauthorized() {
    let (env, contract_id) = setup();

    let ticket_id = symbol_short!("TICKET7");
    let event_id = symbol_short!("EVENT7");
    let owner = <Address as testutils::Address>::generate(&env);
    let wrong_owner = <Address as testutils::Address>::generate(&env);
    let new_owner = <Address as testutils::Address>::generate(&env);

    env.as_contract(&contract_id, || {
        // Issue ticket
        TicketContract::issue_ticket(env.clone(), ticket_id.clone(), event_id, owner.clone());

        // Try to transfer with wrong owner (panics with "not ticket owner")
        TicketContract::transfer_ticket(env.clone(), ticket_id, wrong_owner, new_owner);
    });
}

#[test]
#[should_panic(expected = "already been used")]
fn test_transfer_used_ticket() {
    let (env, contract_id) = setup();

    let ticket_id = symbol_short!("TICKET8");
    let event_id = symbol_short!("EVENT8");
    let owner = <Address as testutils::Address>::generate(&env);
    let new_owner = <Address as testutils::Address>::generate(&env);

    env.as_contract(&contract_id, || {
        // Issue and mark as used
        TicketContract::issue_ticket(env.clone(), ticket_id.clone(), event_id, owner.clone());
        TicketContract::mark_ticket_used(env.clone(), ticket_id.clone());

        // Try to transfer used ticket (panics with "already been used")
        TicketContract::transfer_ticket(env.clone(), ticket_id, owner, new_owner);
    });
}

#[test]
#[should_panic(expected = "Ticket not found")]
fn test_mark_nonexistent_ticket() {
    let (env, contract_id) = setup();

    let ticket_id = symbol_short!("NOEXIST");

    env.as_contract(&contract_id, || {
        TicketContract::mark_ticket_used(env.clone(), ticket_id);
    });
}

#[test]
fn test_is_ticket_owner_correct_owner() {
    let (env, contract_id) = setup();

    let ticket_id = symbol_short!("TICKET9");
    let event_id = symbol_short!("EVENT9");
    let owner = <Address as testutils::Address>::generate(&env);

    env.as_contract(&contract_id, || {
        TicketContract::issue_ticket(env.clone(), ticket_id.clone(), event_id, owner.clone());

        let result = TicketContract::is_ticket_owner(env.clone(), ticket_id, owner.clone());
        assert!(result);
    });
}

#[test]
fn test_is_ticket_owner_wrong_owner() {
    let (env, contract_id) = setup();

    let ticket_id = symbol_short!("TICKETA");
    let event_id = symbol_short!("EVENTA");
    let owner = <Address as testutils::Address>::generate(&env);
    let other = <Address as testutils::Address>::generate(&env);

    env.as_contract(&contract_id, || {
        TicketContract::issue_ticket(env.clone(), ticket_id.clone(), event_id, owner.clone());

        let result = TicketContract::is_ticket_owner(env.clone(), ticket_id, other);
        assert!(!result);
    });
}

#[test]
#[should_panic(expected = "Ticket not found")]
fn test_is_ticket_owner_nonexistent() {
    let (env, contract_id) = setup();

    let ticket_id = symbol_short!("NOEXIST");
    let address = <Address as testutils::Address>::generate(&env);

    env.as_contract(&contract_id, || {
        TicketContract::is_ticket_owner(env.clone(), ticket_id, address);
    });
}

#[test]
fn test_get_ticket_status_not_used() {
    let (env, contract_id) = setup();

    let ticket_id = symbol_short!("TICKETB");
    let event_id = symbol_short!("EVENTB");
    let owner = <Address as testutils::Address>::generate(&env);

    env.as_contract(&contract_id, || {
        TicketContract::issue_ticket(env.clone(), ticket_id.clone(), event_id, owner.clone());

        let (status_owner, is_used) =
            TicketContract::get_ticket_status(env.clone(), ticket_id);
        assert_eq!(status_owner, owner);
        assert!(!is_used);
    });
}

#[test]
fn test_get_ticket_status_after_use() {
    let (env, contract_id) = setup();

    let ticket_id = symbol_short!("TICKETC");
    let event_id = symbol_short!("EVENTC");
    let owner = <Address as testutils::Address>::generate(&env);

    env.as_contract(&contract_id, || {
        TicketContract::issue_ticket(env.clone(), ticket_id.clone(), event_id, owner.clone());
        TicketContract::mark_ticket_used(env.clone(), ticket_id.clone());

        let (status_owner, is_used) =
            TicketContract::get_ticket_status(env.clone(), ticket_id);
        assert_eq!(status_owner, owner);
        assert!(is_used);
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

#[test]
#[should_panic(expected = "Ticket not found")]
fn test_get_ticket_status_nonexistent() {
    let (env, contract_id) = setup();

    let ticket_id = symbol_short!("NOEXIST");

    env.as_contract(&contract_id, || {
        TicketContract::get_ticket_status(env.clone(), ticket_id);
    });
}