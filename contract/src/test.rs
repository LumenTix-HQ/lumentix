#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

fn create_test_contract(env: &Env) -> (Address, LumentixContractClient<'_>) {
    let contract_id = env.register_contract(None, LumentixContract);
    let client = LumentixContractClient::new(env, &contract_id);
    let admin = Address::generate(env);

    let _ = client.initialize(&admin);

    (admin, client)
}

fn create_and_publish_event(
    env: &Env,
    client: &LumentixContractClient,
    organizer: &Address,
) -> u64 {
    let event_id = client.create_event(
        organizer,
        &String::from_str(env, "Test Event"),
        &String::from_str(env, "Description"),
        &String::from_str(env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );

    // Publish the event
    client.update_event_status(&event_id, &EventStatus::Published, organizer);

    event_id
}

#[test]
fn test_initialize_success() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, LumentixContract);
    let client = LumentixContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    let result = client.try_initialize(&admin);
    assert!(result.is_ok());
}

#[test]
fn test_initialize_already_initialized() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);

    // Try to initialize again
    let result = client.try_initialize(&admin);
    assert_eq!(result, Err(Ok(LumentixError::AlreadyInitialized)));
}

#[test]
fn test_create_event_success() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &String::from_str(&env, "Test Event"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );

    assert_eq!(event_id, 1);

    // Verify event is in Draft status
    let event = client.get_event(&event_id);
    assert_eq!(event.status, EventStatus::Draft);
}

#[test]
fn test_create_event_invalid_price() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    let result = client.try_create_event(
        &organizer,
        &String::from_str(&env, "Test Event"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &0i128, // Invalid price
        &50u32,
    );

    assert_eq!(result, Err(Ok(LumentixError::InvalidAmount)));
}

#[test]
fn test_create_event_invalid_capacity() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    let result = client.try_create_event(
        &organizer,
        &String::from_str(&env, "Test Event"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &0u32, // Invalid capacity
    );

    assert_eq!(result, Err(Ok(LumentixError::CapacityExceeded)));
}

#[test]
fn test_create_event_invalid_time_range() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    let result = client.try_create_event(
        &organizer,
        &String::from_str(&env, "Test Event"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &2000u64, // Start after end
        &1000u64,
        &100i128,
        &50u32,
    );

    assert_eq!(result, Err(Ok(LumentixError::InvalidTimeRange)));
}

#[test]
fn test_create_event_empty_name() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    let result = client.try_create_event(
        &organizer,
        &String::from_str(&env, ""), // Empty name
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );

    assert_eq!(result, Err(Ok(LumentixError::EmptyString)));
}

#[test]
fn test_purchase_ticket_success() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);

    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);
    assert_eq!(ticket_id, 1);
}

#[test]
fn test_purchase_ticket_insufficient_funds() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);

    let result = client.try_purchase_ticket(&buyer, &event_id, &50i128);
    assert_eq!(result, Err(Ok(LumentixError::InsufficientFunds)));
}

#[test]
fn test_purchase_ticket_sold_out() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &String::from_str(&env, "Test Event"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &1u32,
    );

    client.update_event_status(&event_id, &EventStatus::Published, &organizer);

    let buyer1 = Address::generate(&env);
    client.purchase_ticket(&buyer1, &event_id, &100i128);

    let buyer2 = Address::generate(&env);
    let result = client.try_purchase_ticket(&buyer2, &event_id, &100i128);
    assert_eq!(result, Err(Ok(LumentixError::EventSoldOut)));
}

#[test]
fn test_use_ticket_success() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);

    let result = client.try_use_ticket(&ticket_id, &organizer);
    assert!(result.is_ok());
}

#[test]
fn test_use_ticket_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);
    let unauthorized = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);

    let result = client.try_use_ticket(&ticket_id, &unauthorized);
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
}

#[test]
fn test_use_ticket_already_used() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);
    client.use_ticket(&ticket_id, &organizer);

    let result = client.try_use_ticket(&ticket_id, &organizer);
    assert_eq!(result, Err(Ok(LumentixError::TicketAlreadyUsed)));
}

#[test]
fn test_cancel_event_and_refund() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);

    let _ = client.cancel_event(&organizer, &event_id);

    let result = client.try_refund_ticket(&ticket_id, &buyer);
    assert!(result.is_ok());
}

#[test]
fn test_refund_event_not_cancelled() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);

    let result = client.try_refund_ticket(&ticket_id, &buyer);
    assert_eq!(result, Err(Ok(LumentixError::EventNotCancelled)));
}

#[test]
fn test_get_event() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &String::from_str(&env, "Test Event"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );

    let event = client.get_event(&event_id);
    assert_eq!(event.id, event_id);
    assert_eq!(event.organizer, organizer);
}

#[test]
fn test_get_event_not_found() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);

    let result = client.try_get_event(&999u64);
    assert!(result.is_err());
}

#[test]
fn test_update_status_draft_to_published() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &String::from_str(&env, "Test Event"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );

    let result = client.try_update_event_status(&event_id, &EventStatus::Published, &organizer);
    assert!(result.is_ok());

    let event = client.get_event(&event_id);
    assert_eq!(event.status, EventStatus::Published);
}

#[test]
fn test_update_status_published_to_cancelled() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);

    let result = client.try_update_event_status(&event_id, &EventStatus::Cancelled, &organizer);
    assert!(result.is_ok());

    let event = client.get_event(&event_id);
    assert_eq!(event.status, EventStatus::Cancelled);
}

#[test]
fn test_update_status_invalid_transition() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &String::from_str(&env, "Test Event"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );

    // Try to go directly from Draft to Completed
    let result = client.try_update_event_status(&event_id, &EventStatus::Completed, &organizer);
    assert_eq!(result, Err(Ok(LumentixError::InvalidStatusTransition)));
}

#[test]
fn test_update_status_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let unauthorized = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &String::from_str(&env, "Test Event"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );

    let result = client.try_update_event_status(&event_id, &EventStatus::Published, &unauthorized);
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
}

#[test]
fn test_purchase_ticket_draft_status_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &String::from_str(&env, "Test Event"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );

    // Try to purchase ticket for draft event
    let result = client.try_purchase_ticket(&buyer, &event_id, &100i128);
    assert_eq!(result, Err(Ok(LumentixError::InvalidStatusTransition)));
}
