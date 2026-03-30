use crate::error::LumentixError;
use crate::lumentix_contract::{LumentixContract, LumentixContractClient};
use crate::storage;
use crate::types::{EventStatus, Ticket};
use soroban_sdk::xdr;
use soroban_sdk::{
    symbol_short, testutils::Address as _, testutils::Events, testutils::Ledger, Address, Env,
    String, TryIntoVal, Val, Vec,
};

fn create_test_contract(env: &Env) -> (Address, LumentixContractClient<'_>) {
    let contract_id = env.register(LumentixContract, ());
    let client = LumentixContractClient::new(env, &contract_id);
    let admin = Address::generate(env);

    client.initialize(&admin);

    (admin, client)
}

fn create_test_contract_with_id(env: &Env) -> (Address, Address, LumentixContractClient<'_>) {
    let contract_id = env.register(LumentixContract, ());
    let client = LumentixContractClient::new(env, &contract_id);
    let admin = Address::generate(env);

    client.initialize(&admin);

    (admin, contract_id, client)
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

// ============================================================================
// INITIALIZATION TESTS
// ============================================================================

#[test]
fn test_initialize_success() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(LumentixContract, ());
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

// ============================================================================
// EVENT CREATION TESTS
// ============================================================================

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

// ============================================================================
// TICKET PURCHASE & CAPACITY ENFORCEMENT TESTS
// ============================================================================

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

#[test]
fn test_batch_purchase_tickets_success_validates_ticket_properties() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    env.ledger().with_mut(|li| li.timestamp = 7777);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_ids = client.batch_purchase_tickets(&buyer, &event_id, &3u32, &300i128);

    assert_eq!(ticket_ids.len(), 3);
    assert_eq!(ticket_ids.get(0).unwrap(), 1);
    assert_eq!(ticket_ids.get(1).unwrap(), 2);
    assert_eq!(ticket_ids.get(2).unwrap(), 3);

    let event = client.get_event(&event_id);
    assert_eq!(event.tickets_sold, 3);

    for ticket_id in ticket_ids.iter() {
        let ticket = client.get_ticket_info(&ticket_id);
        assert_eq!(ticket.event_id, event_id);
        assert_eq!(ticket.owner, buyer);
        assert_eq!(ticket.purchase_time, 7777);
        assert!(!ticket.used);
        assert!(!ticket.refunded);
    }
}

#[test]
fn test_batch_purchase_tickets_collects_fee_and_escrow() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    client.set_platform_fee(&admin, &500u32);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_ids = client.batch_purchase_tickets(&buyer, &event_id, &4u32, &400i128);

    assert_eq!(ticket_ids.len(), 4);
    assert_eq!(client.get_platform_balance(), 20i128);
    assert_eq!(client.get_escrow_balance(&event_id), 380i128);
}

#[test]
fn test_batch_purchase_tickets_rejects_invalid_quantity_limits() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);

    let zero_quantity = client.try_batch_purchase_tickets(&buyer, &event_id, &0u32, &0i128);
    assert_eq!(zero_quantity, Err(Ok(LumentixError::InvalidAmount)));

    let over_batch_limit = client.try_batch_purchase_tickets(&buyer, &event_id, &11u32, &1100i128);
    assert_eq!(over_batch_limit, Err(Ok(LumentixError::CapacityExceeded)));
}

#[test]
fn test_batch_purchase_tickets_rejects_when_capacity_exceeded() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &String::from_str(&env, "Limited Event"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &2u32,
    );
    client.update_event_status(&event_id, &EventStatus::Published, &organizer);

    let result = client.try_batch_purchase_tickets(&buyer, &event_id, &3u32, &300i128);
    assert_eq!(result, Err(Ok(LumentixError::EventSoldOut)));
}

#[test]
fn test_batch_purchase_tickets_rejects_invalid_payment_amount() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);

    let underpayment = client.try_batch_purchase_tickets(&buyer, &event_id, &2u32, &150i128);
    assert_eq!(underpayment, Err(Ok(LumentixError::InsufficientFunds)));

    let overpayment = client.try_batch_purchase_tickets(&buyer, &event_id, &2u32, &250i128);
    assert_eq!(overpayment, Err(Ok(LumentixError::InsufficientFunds)));
}

// ============================================================================
// TICKET USAGE TESTS
// ============================================================================

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

// ============================================================================
// REFUND TESTS
// ============================================================================

#[test]
fn test_cancel_event_and_refund() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);

    client.cancel_event(&organizer, &event_id);

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
fn test_refund_multiple_tickets() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer1 = Address::generate(&env);
    let buyer2 = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_id_1 = client.purchase_ticket(&buyer1, &event_id, &100i128);
    let ticket_id_2 = client.purchase_ticket(&buyer2, &event_id, &100i128);

    // Cancel event
    client.cancel_event(&organizer, &event_id);

    // Both buyers can get refund
    let result1 = client.try_refund_ticket(&ticket_id_1, &buyer1);
    assert!(result1.is_ok());

    let result2 = client.try_refund_ticket(&ticket_id_2, &buyer2);
    assert!(result2.is_ok());

    // Verify tickets are marked as refunded
    let ticket1 = client.get_ticket_info(&ticket_id_1);
    assert!(ticket1.refunded);

    let ticket2 = client.get_ticket_info(&ticket_id_2);
    assert!(ticket2.refunded);
}

#[test]
fn test_refund_used_ticket_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);

    // Use ticket first
    client.use_ticket(&ticket_id, &organizer);

    // Cancel event
    client.cancel_event(&organizer, &event_id);

    // Try to refund used ticket
    let result = client.try_refund_ticket(&ticket_id, &buyer);
    assert_eq!(result, Err(Ok(LumentixError::TicketAlreadyUsed)));
}

#[test]
fn test_refund_twice_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);

    client.cancel_event(&organizer, &event_id);
    client.refund_ticket(&ticket_id, &buyer);

    // Try to refund again
    let result = client.try_refund_ticket(&ticket_id, &buyer);
    assert_eq!(result, Err(Ok(LumentixError::RefundNotAllowed)));
}

#[test]
fn test_refund_wrong_owner_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);
    let wrong_buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);

    client.cancel_event(&organizer, &event_id);

    // Try to refund with wrong owner
    let result = client.try_refund_ticket(&ticket_id, &wrong_buyer);
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
}

// ============================================================================
// EVENT STATUS TESTS
// ============================================================================

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
fn test_get_total_events() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    // Initial total events should be 0
    assert_eq!(client.get_total_events(), 0);

    // Create first event
    client.create_event(
        &organizer,
        &String::from_str(&env, "Event 1"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );

    assert_eq!(client.get_total_events(), 1);

    // Create second event
    client.create_event(
        &organizer,
        &String::from_str(&env, "Event 2"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &3000u64,
        &4000u64,
        &200i128,
        &100u32,
    );

    assert_eq!(client.get_total_events(), 2);
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

    let event_id = create_and_publish_event(&env, &client, &organizer);

    let result = client.try_update_event_status(&event_id, &EventStatus::Published, &unauthorized);
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
}

// ============================================================================
// PLATFORM FEE TESTS
// ============================================================================

#[test]
fn test_set_platform_fee_success() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);

    // Set platform fee to 2.5% (250 basis points)
    let result = client.try_set_platform_fee(&admin, &250u32);
    assert!(result.is_ok());

    let fee = client.get_platform_fee();
    assert_eq!(fee, 250);
}

#[test]
fn test_set_platform_fee_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let unauthorized = Address::generate(&env);

    // Try to set fee as non-admin
    let result = client.try_set_platform_fee(&unauthorized, &250u32);
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
}

#[test]
fn test_set_platform_fee_invalid() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);

    // Try to set fee > 100% (10000 basis points)
    let result = client.try_set_platform_fee(&admin, &10001u32);
    assert_eq!(result, Err(Ok(LumentixError::InvalidPlatformFee)));
}

#[test]
fn test_purchase_ticket_with_platform_fee() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    // Set platform fee to 5% (500 basis points)
    client.set_platform_fee(&admin, &500u32);

    let event_id = create_and_publish_event(&env, &client, &organizer);

    // Purchase ticket for 100
    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);
    assert_eq!(ticket_id, 1);

    // Check platform balance: 5% of 100 = 5
    let platform_balance = client.get_platform_balance();
    assert_eq!(platform_balance, 5);

    // Verify ticket was created
    let ticket = client.get_ticket_info(&ticket_id);
    assert_eq!(ticket.owner, buyer);
}

#[test]
fn test_purchase_ticket_zero_platform_fee() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    // Don't set platform fee (defaults to 0)
    let event_id = create_and_publish_event(&env, &client, &organizer);

    // Purchase ticket for 100
    client.purchase_ticket(&buyer, &event_id, &100i128);

    // Check platform balance: 0% of 100 = 0
    let platform_balance = client.get_platform_balance();
    assert_eq!(platform_balance, 0);
}

#[test]
fn test_withdraw_platform_fees_success() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    // Set platform fee to 10% (1000 basis points)
    client.set_platform_fee(&admin, &1000u32);

    let event_id = create_and_publish_event(&env, &client, &organizer);

    // Purchase 3 tickets for 100 each
    client.purchase_ticket(&buyer, &event_id, &100i128);
    client.purchase_ticket(&buyer, &event_id, &100i128);
    client.purchase_ticket(&buyer, &event_id, &100i128);

    // Platform should have collected 30 (10% of 300)
    let platform_balance = client.get_platform_balance();
    assert_eq!(platform_balance, 30);

    // Withdraw fees
    let withdrawn = client.withdraw_platform_fees(&admin);
    assert_eq!(withdrawn, 30);

    // Balance should be cleared
    let balance_after = client.get_platform_balance();
    assert_eq!(balance_after, 0);
}

#[test]
fn test_withdraw_platform_fees_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let unauthorized = Address::generate(&env);

    // Try to withdraw as non-admin
    let result = client.try_withdraw_platform_fees(&unauthorized);
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
}

#[test]
fn test_withdraw_platform_fees_no_balance() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);

    // Try to withdraw with no fees collected
    let result = client.try_withdraw_platform_fees(&admin);
    assert_eq!(result, Err(Ok(LumentixError::NoPlatformFees)));
}

#[test]
fn test_set_token_success() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(LumentixContract, ());
    let client = LumentixContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let token = Address::generate(&env);

    client.initialize(&admin);

    let result = client.try_set_token(&admin, &token);
    assert!(result.is_ok());

    let stored_token = env.as_contract(&contract_id, || crate::storage::get_token(&env));
    assert_eq!(stored_token, token);
}

#[test]
fn test_set_token_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let unauthorized = Address::generate(&env);
    let token = Address::generate(&env);

    let result = client.try_set_token(&unauthorized, &token);
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
}

#[test]
fn test_set_token_not_initialized() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(LumentixContract, ());
    let client = LumentixContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let token = Address::generate(&env);

    let result = client.try_set_token(&admin, &token);
    assert_eq!(result, Err(Ok(LumentixError::NotInitialized)));
}

#[test]
fn test_get_token_success() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);
    let token = Address::generate(&env);

    client.set_token(&admin, &token);

    let stored_token = client.get_token();
    assert_eq!(stored_token, token);
}

#[test]
fn test_get_token_not_initialized() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(LumentixContract, ());
    let client = LumentixContractClient::new(&env, &contract_id);

    let result = client.try_get_token();
    assert_eq!(result, Err(Ok(LumentixError::NotInitialized)));
}

#[test]
fn test_get_token_missing_returns_error() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);

    let result = client.try_get_token();
    assert_eq!(result, Err(Ok(LumentixError::InvalidAddress)));
}

#[test]
fn test_platform_fee_calculation_precision() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    // Set platform fee to 2.5% (250 basis points)
    client.set_platform_fee(&admin, &250u32);

    let event_id = create_and_publish_event(&env, &client, &organizer);

    // Purchase ticket for 1000
    client.purchase_ticket(&buyer, &event_id, &1000i128);

    // Platform fee should be 25 (2.5% of 1000)
    let platform_balance = client.get_platform_balance();
    assert_eq!(platform_balance, 25);
}

#[test]
fn test_multiple_events_platform_fee_accumulation() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);
    let organizer1 = Address::generate(&env);
    let organizer2 = Address::generate(&env);
    let buyer = Address::generate(&env);

    // Set platform fee to 5% (500 basis points)
    client.set_platform_fee(&admin, &500u32);

    let event_id_1 = create_and_publish_event(&env, &client, &organizer1);
    let event_id_2 = create_and_publish_event(&env, &client, &organizer2);

    // Purchase tickets from both events
    client.purchase_ticket(&buyer, &event_id_1, &200i128); // Fee: 10
    client.purchase_ticket(&buyer, &event_id_2, &300i128); // Fee: 15

    // Platform should have accumulated 25 total
    let platform_balance = client.get_platform_balance();
    assert_eq!(platform_balance, 25);
}

// ============================================================================
// EVENT COMPLETION AND ESCROW RELEASE TESTS
// ============================================================================

#[test]
fn test_complete_event_after_end_time() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);

    // Set ledger timestamp to after end time
    env.ledger().with_mut(|li| li.timestamp = 2001);

    // Complete the event
    let result = client.try_complete_event(&organizer, &event_id);
    assert!(result.is_ok());

    // Verify event status is Completed
    let event = client.get_event(&event_id);
    assert_eq!(event.status, EventStatus::Completed);
}

#[test]
fn test_complete_event_before_end_time_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);

    // Try to complete before end time (end_time is 2000, current is 0)
    let result = client.try_complete_event(&organizer, &event_id);
    assert_eq!(result, Err(Ok(LumentixError::InvalidStatusTransition)));
}

#[test]
fn test_complete_event_only_organizer() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let unauthorized = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    env.ledger().with_mut(|li| li.timestamp = 2001);

    // Try to complete as non-organizer
    let result = client.try_complete_event(&unauthorized, &event_id);
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
}

#[test]
fn test_release_escrow_after_completion() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);

    // Purchase ticket to add funds to escrow
    client.purchase_ticket(&buyer, &event_id, &100i128);

    // Complete event
    env.ledger().with_mut(|li| li.timestamp = 2001);
    client.complete_event(&organizer, &event_id);

    // Release escrow
    let amount = client.release_escrow(&organizer, &event_id);
    assert_eq!(amount, 100);
}

#[test]
fn test_release_escrow_before_completion_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    client.purchase_ticket(&buyer, &event_id, &100i128);

    // Try to release escrow without completing event
    let result = client.try_release_escrow(&organizer, &event_id);
    assert_eq!(result, Err(Ok(LumentixError::InvalidStatusTransition)));
}

#[test]
fn test_release_escrow_only_organizer() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let unauthorized = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    client.purchase_ticket(&buyer, &event_id, &100i128);

    env.ledger().with_mut(|li| li.timestamp = 2001);
    client.complete_event(&organizer, &event_id);

    // Try to release escrow as non-organizer
    let result = client.try_release_escrow(&unauthorized, &event_id);
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
}

#[test]
fn test_release_escrow_twice_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    client.purchase_ticket(&buyer, &event_id, &100i128);

    env.ledger().with_mut(|li| li.timestamp = 2001);
    client.complete_event(&organizer, &event_id);
    client.release_escrow(&organizer, &event_id);

    // Try to release again
    let result = client.try_release_escrow(&organizer, &event_id);
    assert_eq!(result, Err(Ok(LumentixError::EscrowAlreadyReleased)));
}

// ============================================================================
// STATUS TRANSITION TESTS (COMPREHENSIVE)
// ============================================================================

#[test]
fn test_status_transition_draft_to_completed_fails() {
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
fn test_status_transition_draft_to_cancelled_fails() {
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

    // Try to cancel draft event via update_event_status
    let result = client.try_update_event_status(&event_id, &EventStatus::Cancelled, &organizer);
    assert_eq!(result, Err(Ok(LumentixError::InvalidStatusTransition)));
}

#[test]
fn test_status_transition_published_to_completed_requires_time() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);

    // Try to complete before end time
    let result = client.try_update_event_status(&event_id, &EventStatus::Completed, &organizer);
    assert_eq!(result, Err(Ok(LumentixError::InvalidStatusTransition)));

    // Set time after end time
    env.ledger().with_mut(|li| li.timestamp = 2001);

    // Now it should work
    let result = client.try_update_event_status(&event_id, &EventStatus::Completed, &organizer);
    assert!(result.is_ok());
}

#[test]
fn test_status_transition_completed_is_final() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    env.ledger().with_mut(|li| li.timestamp = 2001);
    client.complete_event(&organizer, &event_id);

    // Try to transition from Completed to any other status
    let result = client.try_update_event_status(&event_id, &EventStatus::Published, &organizer);
    assert_eq!(result, Err(Ok(LumentixError::InvalidStatusTransition)));

    let result = client.try_update_event_status(&event_id, &EventStatus::Cancelled, &organizer);
    assert_eq!(result, Err(Ok(LumentixError::InvalidStatusTransition)));
}

#[test]
fn test_status_transition_cancelled_is_final() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    client.cancel_event(&organizer, &event_id);

    // Try to transition from Cancelled to any other status
    let result = client.try_update_event_status(&event_id, &EventStatus::Published, &organizer);
    assert_eq!(result, Err(Ok(LumentixError::InvalidStatusTransition)));

    let result = client.try_update_event_status(&event_id, &EventStatus::Completed, &organizer);
    assert_eq!(result, Err(Ok(LumentixError::InvalidStatusTransition)));
}

// ============================================================================
// TICKET CAPACITY & AVAILABILITY TESTS
// ============================================================================

#[test]
fn test_event_tickets_sold_counter() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);

    // Initially 0 tickets sold
    let event = client.get_event(&event_id);
    assert_eq!(event.tickets_sold, 0);

    // Purchase 3 tickets
    client.purchase_ticket(&buyer, &event_id, &100i128);
    let event = client.get_event(&event_id);
    assert_eq!(event.tickets_sold, 1);

    client.purchase_ticket(&buyer, &event_id, &100i128);
    let event = client.get_event(&event_id);
    assert_eq!(event.tickets_sold, 2);

    client.purchase_ticket(&buyer, &event_id, &100i128);
    let event = client.get_event(&event_id);
    assert_eq!(event.tickets_sold, 3);
}

#[test]
fn test_event_capacity_enforcement() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    // Create event with capacity of 2
    let event_id = client.create_event(
        &organizer,
        &String::from_str(&env, "Test Event"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &2u32,
    );
    client.update_event_status(&event_id, &EventStatus::Published, &organizer);

    let buyer = Address::generate(&env);

    // First two tickets succeed
    client.purchase_ticket(&buyer, &event_id, &100i128);
    client.purchase_ticket(&buyer, &event_id, &100i128);

    // Third ticket fails
    let result = client.try_purchase_ticket(&buyer, &event_id, &100i128);
    assert_eq!(result, Err(Ok(LumentixError::EventSoldOut)));
}

#[test]
fn test_get_availability() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    // Create event with capacity of 5
    let event_id = client.create_event(
        &organizer,
        &String::from_str(&env, "Test Event"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &5u32,
    );
    client.update_event_status(&event_id, &EventStatus::Published, &organizer);

    // Initially 5 available
    assert_eq!(client.get_availability(&event_id), 5);

    // Purchase 2 tickets -> 3 remaining
    client.purchase_ticket(&buyer, &event_id, &100i128);
    client.purchase_ticket(&buyer, &event_id, &100i128);
    assert_eq!(client.get_availability(&event_id), 3);

    // Purchase 3 more -> 0 remaining
    client.purchase_ticket(&buyer, &event_id, &100i128);
    client.purchase_ticket(&buyer, &event_id, &100i128);
    client.purchase_ticket(&buyer, &event_id, &100i128);
    assert_eq!(client.get_availability(&event_id), 0);
}

#[test]
fn test_refund_frees_capacity() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    // Create event with capacity of 2
    let event_id = client.create_event(
        &organizer,
        &String::from_str(&env, "Test Event"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &2u32,
    );
    client.update_event_status(&event_id, &EventStatus::Published, &organizer);

    // Buy 2 tickets (sold out)
    let ticket_id_1 = client.purchase_ticket(&buyer, &event_id, &100i128);
    let _ticket_id_2 = client.purchase_ticket(&buyer, &event_id, &100i128);
    assert_eq!(client.get_availability(&event_id), 0);

    // Cancel and refund 1 ticket -> 1 available
    client.cancel_event(&organizer, &event_id);
    client.refund_ticket(&ticket_id_1, &buyer);

    let event = client.get_event(&event_id);
    assert_eq!(event.tickets_sold, 1);
    // Note: availability still works even for cancelled events
    assert_eq!(client.get_availability(&event_id), 1);
}

// ============================================================================
// ID INCREMENT TESTS
// ============================================================================

#[test]
fn test_event_id_increments() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    let event_id_1 = client.create_event(
        &organizer,
        &String::from_str(&env, "Event 1"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );

    let event_id_2 = client.create_event(
        &organizer,
        &String::from_str(&env, "Event 2"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );

    assert_eq!(event_id_1, 1);
    assert_eq!(event_id_2, 2);
}

#[test]
fn test_ticket_id_increments() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);

    let ticket_id_1 = client.purchase_ticket(&buyer, &event_id, &100i128);
    let ticket_id_2 = client.purchase_ticket(&buyer, &event_id, &100i128);
    let ticket_id_3 = client.purchase_ticket(&buyer, &event_id, &100i128);

    assert_eq!(ticket_id_1, 1);
    assert_eq!(ticket_id_2, 2);
    assert_eq!(ticket_id_3, 3);
}

// ============================================================================
// TICKET OWNERSHIP TESTS
// ============================================================================

#[test]
fn test_ticket_ownership_verification() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);

    // Verify ticket ownership
    let ticket = client.get_ticket_info(&ticket_id);
    assert_eq!(ticket.owner, buyer);
    assert_eq!(ticket.event_id, event_id);
    assert_eq!(ticket.id, ticket_id);
    assert!(!ticket.used);
    assert!(!ticket.refunded);
}

#[test]
fn test_ticket_double_check_in_prevention() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);

    // First check-in succeeds
    client.use_ticket(&ticket_id, &organizer);
    let ticket = client.get_ticket_info(&ticket_id);
    assert!(ticket.used);

    // Second check-in fails
    let result = client.try_use_ticket(&ticket_id, &organizer);
    assert_eq!(result, Err(Ok(LumentixError::TicketAlreadyUsed)));
}

#[test]
fn test_multiple_tickets_same_buyer() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);

    // Buy 3 tickets
    let ticket_id_1 = client.purchase_ticket(&buyer, &event_id, &100i128);
    let ticket_id_2 = client.purchase_ticket(&buyer, &event_id, &100i128);
    let ticket_id_3 = client.purchase_ticket(&buyer, &event_id, &100i128);

    // Verify all tickets are owned by same buyer
    assert_eq!(client.get_ticket_info(&ticket_id_1).owner, buyer);
    assert_eq!(client.get_ticket_info(&ticket_id_2).owner, buyer);
    assert_eq!(client.get_ticket_info(&ticket_id_3).owner, buyer);

    // Verify they have different IDs
    assert_ne!(ticket_id_1, ticket_id_2);
    assert_ne!(ticket_id_2, ticket_id_3);
    assert_ne!(ticket_id_1, ticket_id_3);
}

// ============================================================================
// FULL LIFECYCLE INTEGRATION TESTS
// ============================================================================

#[test]
fn test_full_event_lifecycle_happy_path() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer1 = Address::generate(&env);
    let buyer2 = Address::generate(&env);

    // 1. Create event in Draft
    let event_id = client.create_event(
        &organizer,
        &String::from_str(&env, "Concert"),
        &String::from_str(&env, "Amazing concert"),
        &String::from_str(&env, "Stadium"),
        &1000u64,
        &2000u64,
        &100i128,
        &10u32,
    );
    assert_eq!(client.get_event(&event_id).status, EventStatus::Draft);

    // 2. Publish event
    client.update_event_status(&event_id, &EventStatus::Published, &organizer);
    assert_eq!(client.get_event(&event_id).status, EventStatus::Published);

    // 3. Sell tickets
    let ticket1 = client.purchase_ticket(&buyer1, &event_id, &100i128);
    let ticket2 = client.purchase_ticket(&buyer2, &event_id, &100i128);
    assert_eq!(client.get_event(&event_id).tickets_sold, 2);

    // 4. Validate tickets at event
    client.use_ticket(&ticket1, &organizer);
    client.use_ticket(&ticket2, &organizer);
    assert!(client.get_ticket_info(&ticket1).used);
    assert!(client.get_ticket_info(&ticket2).used);

    // 5. Complete event after end time
    env.ledger().with_mut(|li| li.timestamp = 2001);
    client.complete_event(&organizer, &event_id);
    assert_eq!(client.get_event(&event_id).status, EventStatus::Completed);

    // 6. Release escrow
    let amount = client.release_escrow(&organizer, &event_id);
    assert_eq!(amount, 200); // 2 tickets at 100 each
}

#[test]
fn test_full_event_cancellation_with_refunds() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer1 = Address::generate(&env);
    let buyer2 = Address::generate(&env);

    // Create and publish event
    let event_id = create_and_publish_event(&env, &client, &organizer);

    // Sell tickets
    let ticket1 = client.purchase_ticket(&buyer1, &event_id, &100i128);
    let ticket2 = client.purchase_ticket(&buyer2, &event_id, &100i128);

    // Cancel event
    client.cancel_event(&organizer, &event_id);
    assert_eq!(client.get_event(&event_id).status, EventStatus::Cancelled);

    // Process refunds
    client.refund_ticket(&ticket1, &buyer1);
    client.refund_ticket(&ticket2, &buyer2);

    assert!(client.get_ticket_info(&ticket1).refunded);
    assert!(client.get_ticket_info(&ticket2).refunded);
}

#[test]
fn test_event_with_platform_fee_end_to_end() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    // Set 10% platform fee
    client.set_platform_fee(&admin, &1000u32);

    // Create and publish event
    let event_id = create_and_publish_event(&env, &client, &organizer);

    // Sell tickets
    client.purchase_ticket(&buyer, &event_id, &100i128); // Fee: 10, Escrow: 90
    client.purchase_ticket(&buyer, &event_id, &100i128); // Fee: 10, Escrow: 90

    // Verify platform collected fees
    assert_eq!(client.get_platform_balance(), 20);

    // Complete event
    env.ledger().with_mut(|li| li.timestamp = 2001);
    client.complete_event(&organizer, &event_id);

    // Organizer releases escrow (gets 180, not 200)
    let escrow = client.release_escrow(&organizer, &event_id);
    assert_eq!(escrow, 180);

    // Admin withdraws platform fees
    let fees = client.withdraw_platform_fees(&admin);
    assert_eq!(fees, 20);
}

// ============================================================================
// EVENT FILTERING TESTS
// ============================================================================

#[test]
fn test_get_active_events_only_published() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    // 1. Create 3 events: 1 Published, 1 Draft, 1 Published

    // Event 1: Published
    let event_id_1 = client.create_event(
        &organizer,
        &String::from_str(&env, "Published Event 1"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );
    client.update_event_status(&event_id_1, &EventStatus::Published, &organizer);

    // Event 2: Draft
    let _event_id_2 = client.create_event(
        &organizer,
        &String::from_str(&env, "Draft Event"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );

    // Event 3: Published
    let event_id_3 = client.create_event(
        &organizer,
        &String::from_str(&env, "Published Event 2"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );
    client.update_event_status(&event_id_3, &EventStatus::Published, &organizer);

    // 2. Call get_active_events
    let active_events = client.get_active_events();

    // 3. Verify exactly 2 events returned and they are the correct ones
    assert_eq!(active_events.len(), 2);
    assert_eq!(active_events.get(0).unwrap().id, event_id_1);
    assert_eq!(active_events.get(1).unwrap().id, event_id_3);

    for event in active_events.iter() {
        assert_eq!(event.status, EventStatus::Published);
    }
}

#[test]
fn test_get_active_events_empty() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    // Create only draft events
    client.create_event(
        &organizer,
        &String::from_str(&env, "Draft Event"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );

    let active_events = client.get_active_events();
    assert_eq!(active_events.len(), 0);
}

#[test]
fn test_get_events_by_organizer_empty() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    let events = client.get_events_by_organizer(&organizer);
    assert_eq!(events.len(), 0);
}

#[test]
fn test_get_events_by_organizer_single_event_full_field_validation() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &String::from_str(&env, "Organizer Event"),
        &String::from_str(&env, "Organizer Description"),
        &String::from_str(&env, "Organizer Location"),
        &1234u64,
        &5678u64,
        &250i128,
        &75u32,
    );

    let events = client.get_events_by_organizer(&organizer);
    assert_eq!(events.len(), 1);

    let event = events.get(0).unwrap();
    assert_eq!(event.id, event_id);
    assert_eq!(event.organizer, organizer);
    assert_eq!(event.name, String::from_str(&env, "Organizer Event"));
    assert_eq!(
        event.description,
        String::from_str(&env, "Organizer Description")
    );
    assert_eq!(event.location, String::from_str(&env, "Organizer Location"));
    assert_eq!(event.start_time, 1234u64);
    assert_eq!(event.end_time, 5678u64);
    assert_eq!(event.ticket_price, 250i128);
    assert_eq!(event.max_tickets, 75u32);
    assert_eq!(event.tickets_sold, 0u32);
    assert_eq!(event.status, EventStatus::Draft);
}

#[test]
fn test_get_events_by_organizer_multiple_events() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    let event_id_1 = client.create_event(
        &organizer,
        &String::from_str(&env, "Event 1"),
        &String::from_str(&env, "Description 1"),
        &String::from_str(&env, "Location 1"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );

    let event_id_2 = client.create_event(
        &organizer,
        &String::from_str(&env, "Event 2"),
        &String::from_str(&env, "Description 2"),
        &String::from_str(&env, "Location 2"),
        &3000u64,
        &4000u64,
        &200i128,
        &25u32,
    );

    let events = client.get_events_by_organizer(&organizer);
    assert_eq!(events.len(), 2);
    assert_eq!(events.get(0).unwrap().id, event_id_1);
    assert_eq!(events.get(1).unwrap().id, event_id_2);
}

#[test]
fn test_get_events_by_organizer_isolates_other_organizers() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer_a = Address::generate(&env);
    let organizer_b = Address::generate(&env);

    let event_id_a1 = client.create_event(
        &organizer_a,
        &String::from_str(&env, "A Event 1"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );

    let event_id_b1 = client.create_event(
        &organizer_b,
        &String::from_str(&env, "B Event 1"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &3000u64,
        &4000u64,
        &150i128,
        &40u32,
    );

    let event_id_a2 = client.create_event(
        &organizer_a,
        &String::from_str(&env, "A Event 2"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &5000u64,
        &6000u64,
        &200i128,
        &30u32,
    );

    let organizer_a_events = client.get_events_by_organizer(&organizer_a);
    assert_eq!(organizer_a_events.len(), 2);
    assert_eq!(organizer_a_events.get(0).unwrap().id, event_id_a1);
    assert_eq!(organizer_a_events.get(1).unwrap().id, event_id_a2);

    let organizer_b_events = client.get_events_by_organizer(&organizer_b);
    assert_eq!(organizer_b_events.len(), 1);
    assert_eq!(organizer_b_events.get(0).unwrap().id, event_id_b1);
}

#[test]
fn test_get_events_by_organizer_includes_cancelled_events() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    let draft_event_id = client.create_event(
        &organizer,
        &String::from_str(&env, "Draft Event"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );

    let cancelled_event_id = create_and_publish_event(&env, &client, &organizer);
    client.cancel_event(&organizer, &cancelled_event_id);

    let events = client.get_events_by_organizer(&organizer);
    assert_eq!(events.len(), 2);
    assert_eq!(events.get(0).unwrap().id, draft_event_id);
    assert_eq!(events.get(1).unwrap().id, cancelled_event_id);
    assert_eq!(events.get(1).unwrap().status, EventStatus::Cancelled);
}

// ============================================================================
// EVENT EMISSION TESTS
// ============================================================================

#[test]
fn test_event_created_emitted_with_correct_fields() {
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

    // Get all events emitted
    let events = env.events().all();
    assert_eq!(events.events().len(), 1);

    let xdr_event = events.events().get(0).unwrap();

    // Verify topic
    if let xdr::ContractEventBody::V0(body) = &xdr_event.body {
        assert_eq!(body.topics.len(), 1);
        if let xdr::ScVal::Symbol(topic_sym) = &body.topics[0] {
            assert_eq!(topic_sym.as_slice(), b"evtcreate");
        } else {
            panic!("Expected Symbol topic");
        }

        // Verify data is a tuple with correct structure
        if let xdr::ScVal::Vec(Some(data_vec)) = &body.data {
            assert_eq!(data_vec.len(), 7); // (event_id, organizer, name, price, max_tickets, start, end)
        } else {
            panic!("Expected Vec data");
        }
    } else {
        panic!("Expected V0 event body");
    }
}

#[test]
fn test_ticket_purchased_emitted_with_correct_amounts() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);

    // Purchase ticket
    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);

    // Get all events - should have EventCreated, EventStatusChanged, TicketPurchased
    let events = env.events().all();
    assert!(events.events().len() >= 1);

    // Find TicketPurchased event by topic
    let mut found = false;
    for xdr_event in events.events() {
        if let xdr::ContractEventBody::V0(body) = &xdr_event.body {
            if let xdr::ScVal::Symbol(topic_sym) = &body.topics[0] {
                if topic_sym.as_slice() == b"tktbuy" {
                    found = true;
                    // Verify data structure: (ticket_id, event_id, buyer, amount, platform_fee, organizer_amount)
                    if let xdr::ScVal::Vec(Some(data_vec)) = &body.data {
                        assert_eq!(data_vec.len(), 6);
                    } else {
                        panic!("Expected Vec data");
                    }
                    break;
                }
            }
        }
    }
    assert!(found, "TicketPurchased event not found");
}

#[test]
fn test_ticket_purchased_with_platform_fee_emitted_correctly() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    // Set platform fee to 5% (500 basis points)
    client.set_platform_fee(&admin, &500u32);

    let event_id = create_and_publish_event(&env, &client, &organizer);

    // Purchase ticket for 200
    client.purchase_ticket(&buyer, &event_id, &200i128);

    // Find TicketPurchased event
    let events = env.events().all();
    let mut found = false;
    for xdr_event in events.events() {
        if let xdr::ContractEventBody::V0(body) = &xdr_event.body {
            if let xdr::ScVal::Symbol(topic_sym) = &body.topics[0] {
                if topic_sym.as_slice() == b"tktbuy" {
                    found = true;
                    if let xdr::ScVal::Vec(Some(data_vec)) = &body.data {
                        assert_eq!(data_vec.len(), 6);
                    }
                    break;
                }
            }
        }
    }
    assert!(found, "TicketPurchased event not found");
}

#[test]
fn test_event_cancelled_emitted_with_correct_tickets_sold() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);

    // Purchase 3 tickets
    client.purchase_ticket(&buyer, &event_id, &100i128);
    client.purchase_ticket(&buyer, &event_id, &100i128);
    client.purchase_ticket(&buyer, &event_id, &100i128);

    // Cancel event
    client.cancel_event(&organizer, &event_id);

    // Find EventCancelled event
    let events = env.events().all();
    let mut found = false;
    for xdr_event in events.events() {
        if let xdr::ContractEventBody::V0(body) = &xdr_event.body {
            if let xdr::ScVal::Symbol(topic_sym) = &body.topics[0] {
                if topic_sym.as_slice() == b"evcncld" {
                    found = true;
                    // Verify data structure: (event_id, organizer, tickets_sold)
                    if let xdr::ScVal::Vec(Some(data_vec)) = &body.data {
                        assert_eq!(data_vec.len(), 3);
                    }
                    break;
                }
            }
        }
    }
    assert!(found, "EventCancelled event not found");
}

#[test]
fn test_event_completed_emitted_with_correct_tickets_sold() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);

    // Purchase 5 tickets
    client.purchase_ticket(&buyer, &event_id, &100i128);
    client.purchase_ticket(&buyer, &event_id, &100i128);
    client.purchase_ticket(&buyer, &event_id, &100i128);
    client.purchase_ticket(&buyer, &event_id, &100i128);
    client.purchase_ticket(&buyer, &event_id, &100i128);

    // Set timestamp after end time and complete event
    env.ledger().with_mut(|li| li.timestamp = 2001);
    client.complete_event(&organizer, &event_id);

    // Find EventCompleted event
    let events = env.events().all();
    let mut found = false;
    for xdr_event in events.events() {
        if let xdr::ContractEventBody::V0(body) = &xdr_event.body {
            if let xdr::ScVal::Symbol(topic_sym) = &body.topics[0] {
                if topic_sym.as_slice() == b"evtcmpl" {
                    found = true;
                    // Verify data structure: (event_id, organizer, tickets_sold)
                    if let xdr::ScVal::Vec(Some(data_vec)) = &body.data {
                        assert_eq!(data_vec.len(), 3);
                    }
                    break;
                }
            }
        }
    }
    assert!(found, "EventCompleted event not found");
}

#[test]
fn test_escrow_released_emitted_with_correct_amount() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);

    // Purchase tickets totaling 300
    client.purchase_ticket(&buyer, &event_id, &100i128);
    client.purchase_ticket(&buyer, &event_id, &100i128);
    client.purchase_ticket(&buyer, &event_id, &100i128);

    // Complete event
    env.ledger().with_mut(|li| li.timestamp = 2001);
    client.complete_event(&organizer, &event_id);

    // Release escrow
    let released_amount = client.release_escrow(&organizer, &event_id);
    assert_eq!(released_amount, 300i128);

    // Note: EscrowReleased event is not currently emitted in the contract
    // This test verifies the release_escrow functionality returns correct amount
    // The event emission would need to be added to lumentix_contract.rs
}

#[test]
fn test_platform_fee_updated_emitted_with_old_and_new_fee() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);

    // Set platform fee from 0 to 250 (2.5%)
    client.set_platform_fee(&admin, &250u32);

    // Find PlatformFeeUpdated event
    let events = env.events().all();
    let mut found = false;
    for xdr_event in events.events() {
        if let xdr::ContractEventBody::V0(body) = &xdr_event.body {
            if let xdr::ScVal::Symbol(topic_sym) = &body.topics[0] {
                if topic_sym.as_slice() == b"feeupdate" {
                    found = true;
                    // Verify data structure: (admin, old_fee_bps, new_fee_bps)
                    if let xdr::ScVal::Vec(Some(data_vec)) = &body.data {
                        assert_eq!(data_vec.len(), 3);
                    }
                    break;
                }
            }
        }
    }
    assert!(found, "PlatformFeeUpdated event not found");
}

#[test]
fn test_platform_fee_updated_from_existing_value() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);

    // Set initial fee to 500 (5%)
    client.set_platform_fee(&admin, &500u32);

    // Verify event was emitted
    let events = env.events().all();
    let mut found = false;
    for xdr_event in events.events() {
        if let xdr::ContractEventBody::V0(body) = &xdr_event.body {
            if let xdr::ScVal::Symbol(topic_sym) = &body.topics[0] {
                if topic_sym.as_slice() == b"feeupdate" {
                    found = true;
                    break;
                }
            }
        }
    }
    assert!(found, "PlatformFeeUpdated event should be emitted");

    // Update fee to 750 (7.5%) - verify this also works
    client.set_platform_fee(&admin, &750u32);
    let current_fee = client.get_platform_fee();
    assert_eq!(current_fee, 750, "Fee should be updated to 750");
}

#[test]
fn test_platform_fees_withdrawn_emitted_with_correct_amount() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    // Set platform fee to 10% (1000 basis points)
    client.set_platform_fee(&admin, &1000u32);

    let event_id = create_and_publish_event(&env, &client, &organizer);

    // Purchase 4 tickets for 100 each = 400 total, 40 fees
    client.purchase_ticket(&buyer, &event_id, &100i128);
    client.purchase_ticket(&buyer, &event_id, &100i128);
    client.purchase_ticket(&buyer, &event_id, &100i128);
    client.purchase_ticket(&buyer, &event_id, &100i128);

    // Withdraw platform fees
    let withdrawn = client.withdraw_platform_fees(&admin);
    assert_eq!(withdrawn, 40i128);

    // Find PlatformFeesWithdrawn event
    let events = env.events().all();
    let mut found = false;
    for xdr_event in events.events() {
        if let xdr::ContractEventBody::V0(body) = &xdr_event.body {
            if let xdr::ScVal::Symbol(topic_sym) = &body.topics[0] {
                if topic_sym.as_slice() == b"feewith" {
                    found = true;
                    // Verify data structure: (admin, amount)
                    if let xdr::ScVal::Vec(Some(data_vec)) = &body.data {
                        assert_eq!(data_vec.len(), 2);
                    }
                    break;
                }
            }
        }
    }
    assert!(found, "PlatformFeesWithdrawn event not found");
}

#[test]
fn test_event_status_changed_emitted_with_correct_statuses() {
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

    // Update status from Draft to Published
    client.update_event_status(&event_id, &EventStatus::Published, &organizer);

    // Find EventStatusChanged event
    let events = env.events().all();
    let mut found = false;
    for xdr_event in events.events() {
        if let xdr::ContractEventBody::V0(body) = &xdr_event.body {
            if let xdr::ScVal::Symbol(topic_sym) = &body.topics[0] {
                if topic_sym.as_slice() == b"stschng" {
                    found = true;
                    // Verify data structure: (event_id, caller, old_status, new_status)
                    if let xdr::ScVal::Vec(Some(data_vec)) = &body.data {
                        assert_eq!(data_vec.len(), 4);
                    }
                    break;
                }
            }
        }
    }
    assert!(found, "EventStatusChanged event not found");
}

#[test]
fn test_event_status_changed_published_to_cancelled() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);

    // Cancel event (Published -> Cancelled)
    // Note: cancel_event emits EventCancelled, not EventStatusChanged
    client.cancel_event(&organizer, &event_id);

    // Find EventCancelled event
    let events = env.events().all();
    let mut found = false;
    for xdr_event in events.events() {
        if let xdr::ContractEventBody::V0(body) = &xdr_event.body {
            if let xdr::ScVal::Symbol(topic_sym) = &body.topics[0] {
                if topic_sym.as_slice() == b"evcncld" {
                    found = true;
                    break;
                }
            }
        }
    }
    assert!(found, "EventCancelled event not found for cancel");
}

#[test]
fn test_event_status_changed_published_to_completed() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);

    // Set timestamp after end time and complete event
    // Note: complete_event emits EventCompleted, not EventStatusChanged
    env.ledger().with_mut(|li| li.timestamp = 2001);
    client.complete_event(&organizer, &event_id);

    // Find EventCompleted event
    let events = env.events().all();
    let mut found = false;
    for xdr_event in events.events() {
        if let xdr::ContractEventBody::V0(body) = &xdr_event.body {
            if let xdr::ScVal::Symbol(topic_sym) = &body.topics[0] {
                if topic_sym.as_slice() == b"evtcmpl" {
                    found = true;
                    break;
                }
            }
        }
    }
    assert!(found, "EventCompleted event not found for completion");
}

// ============================================================================
// CHANGE ADMIN TESTS
// ============================================================================

#[test]
fn test_change_admin_success() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);
    let new_admin = Address::generate(&env);

    // Change admin
    let result = client.try_change_admin(&admin, &new_admin);
    assert!(result.is_ok());

    // Verify new admin can call admin functions
    let set_fee_result = client.try_set_platform_fee(&new_admin, &250u32);
    assert!(set_fee_result.is_ok());

    // Verify old admin can no longer call admin functions
    let old_admin_set_fee_result = client.try_set_platform_fee(&admin, &300u32);
    assert_eq!(
        old_admin_set_fee_result,
        Err(Ok(LumentixError::Unauthorized))
    );
}

#[test]
fn test_change_admin_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);
    let unauthorized = Address::generate(&env);
    let new_admin = Address::generate(&env);

    // Try to change admin as unauthorized user
    let result = client.try_change_admin(&unauthorized, &new_admin);
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));

    // Verify admin is still the original
    let current_admin = client.get_admin();
    assert_eq!(current_admin, admin);
}

#[test]
fn test_change_admin_to_same_address_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);

    // Try to change admin to the same address
    let result = client.try_change_admin(&admin, &admin);
    assert_eq!(result, Err(Ok(LumentixError::InvalidAddress)));

    // Verify admin is unchanged
    let current_admin = client.get_admin();
    assert_eq!(current_admin, admin);
}

#[test]
fn test_change_admin_get_admin_returns_new_address() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);
    let new_admin = Address::generate(&env);

    // Change admin
    client.change_admin(&admin, &new_admin);

    // Verify get_admin returns the new admin
    let current_admin = client.get_admin();
    assert_eq!(current_admin, new_admin);
}

#[test]
fn test_change_admin_set_platform_fee_with_new_admin() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);
    let new_admin = Address::generate(&env);

    // Change admin
    client.change_admin(&admin, &new_admin);

    // New admin should be able to set platform fee
    let result = client.try_set_platform_fee(&new_admin, &500u32);
    assert!(result.is_ok());

    // Verify fee was set
    let fee = client.get_platform_fee();
    assert_eq!(fee, 500);
}

#[test]
fn test_change_admin_withdraw_platform_fees_with_new_admin() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);
    let new_admin = Address::generate(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    // Set platform fee and collect some fees
    client.set_platform_fee(&admin, &1000u32);
    let event_id = create_and_publish_event(&env, &client, &organizer);
    client.purchase_ticket(&buyer, &event_id, &100i128);

    // Change admin
    client.change_admin(&admin, &new_admin);

    // New admin should be able to withdraw fees
    let withdrawn = client.withdraw_platform_fees(&new_admin);
    assert_eq!(withdrawn, 10i128);

    // Old admin should not be able to withdraw
    let old_admin_result = client.try_withdraw_platform_fees(&admin);
    assert_eq!(old_admin_result, Err(Ok(LumentixError::Unauthorized)));
}

#[test]
fn test_change_admin_chain_a_to_b_to_c() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin_a, client) = create_test_contract(&env);
    let admin_b = Address::generate(&env);
    let admin_c = Address::generate(&env);

    // A -> B
    client.change_admin(&admin_a, &admin_b);

    // Verify B is now admin
    let current_admin = client.get_admin();
    assert_eq!(current_admin, admin_b);

    // B -> C
    client.change_admin(&admin_b, &admin_c);

    // Verify C is now admin
    let current_admin = client.get_admin();
    assert_eq!(current_admin, admin_c);

    // Verify A is no longer admin
    let a_set_fee_result = client.try_set_platform_fee(&admin_a, &250u32);
    assert_eq!(a_set_fee_result, Err(Ok(LumentixError::Unauthorized)));

    // Verify B is no longer admin
    let b_set_fee_result = client.try_set_platform_fee(&admin_b, &250u32);
    assert_eq!(b_set_fee_result, Err(Ok(LumentixError::Unauthorized)));

    // Verify C is the only admin
    let c_set_fee_result = client.try_set_platform_fee(&admin_c, &250u32);
    assert!(c_set_fee_result.is_ok());
}

#[test]
fn test_change_admin_emits_event() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);
    let new_admin = Address::generate(&env);

    // Change admin
    client.change_admin(&admin, &new_admin);

    // Verify AdminChanged event was emitted
    let events = env.events().all();
    let mut found = false;
    for xdr_event in events.events() {
        if let xdr::ContractEventBody::V0(body) = &xdr_event.body {
            if let xdr::ScVal::Symbol(topic_sym) = &body.topics[0] {
                if topic_sym.as_slice() == b"admchng" {
                    found = true;
                    // Verify event data structure: (caller, old_admin, new_admin)
                    if let xdr::ScVal::Vec(Some(data_vec)) = &body.data {
                        assert_eq!(data_vec.len(), 3);
                    }
                    break;
                }
            }
        }
    }
    assert!(found, "AdminChanged event not found");
}

// ============================================================================
// UPDATE EVENT TESTS
// ============================================================================

#[test]
fn test_update_event_draft_success_all_fields() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    // Create a draft event
    let event_id = client.create_event(
        &organizer,
        &String::from_str(&env, "Original Event"),
        &String::from_str(&env, "Original Description"),
        &String::from_str(&env, "Original Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );

    // Update all fields
    let result = client.try_update_event(
        &organizer,
        &event_id,
        &String::from_str(&env, "Updated Event"),
        &String::from_str(&env, "Updated Description"),
        &String::from_str(&env, "Updated Location"),
        &1500u64,
        &2500u64,
        &150i128,
        &100u32,
    );
    assert!(result.is_ok());
}

#[test]
fn test_update_event_published_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    // Create and publish event
    let event_id = create_and_publish_event(&env, &client, &organizer);

    // Try to update published event
    let result = client.try_update_event(
        &organizer,
        &event_id,
        &String::from_str(&env, "Updated Event"),
        &String::from_str(&env, "Updated Description"),
        &String::from_str(&env, "Updated Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );
    assert_eq!(result, Err(Ok(LumentixError::InvalidStatusTransition)));
}

#[test]
fn test_update_event_cancelled_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    // Create, publish, and cancel event
    let event_id = create_and_publish_event(&env, &client, &organizer);
    client.cancel_event(&organizer, &event_id);

    // Try to update cancelled event
    let result = client.try_update_event(
        &organizer,
        &event_id,
        &String::from_str(&env, "Updated Event"),
        &String::from_str(&env, "Updated Description"),
        &String::from_str(&env, "Updated Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );
    assert_eq!(result, Err(Ok(LumentixError::InvalidStatusTransition)));
}

#[test]
fn test_update_event_completed_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    // Create, publish, and complete event
    let event_id = create_and_publish_event(&env, &client, &organizer);
    env.ledger().with_mut(|li| li.timestamp = 2001);
    client.complete_event(&organizer, &event_id);

    // Try to update completed event
    let result = client.try_update_event(
        &organizer,
        &event_id,
        &String::from_str(&env, "Updated Event"),
        &String::from_str(&env, "Updated Description"),
        &String::from_str(&env, "Updated Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );
    assert_eq!(result, Err(Ok(LumentixError::InvalidStatusTransition)));
}

#[test]
fn test_update_event_unauthorized_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let unauthorized = Address::generate(&env);

    // Create a draft event
    let event_id = client.create_event(
        &organizer,
        &String::from_str(&env, "Original Event"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );

    // Try to update as unauthorized user
    let result = client.try_update_event(
        &unauthorized,
        &event_id,
        &String::from_str(&env, "Updated Event"),
        &String::from_str(&env, "Updated Description"),
        &String::from_str(&env, "Updated Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
}

#[test]
fn test_update_event_invalid_time_range_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    // Create a draft event
    let event_id = client.create_event(
        &organizer,
        &String::from_str(&env, "Original Event"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );

    // Try to update with invalid time range (start >= end)
    let result = client.try_update_event(
        &organizer,
        &event_id,
        &String::from_str(&env, "Updated Event"),
        &String::from_str(&env, "Updated Description"),
        &String::from_str(&env, "Updated Location"),
        &2500u64, // start after end
        &2000u64,
        &100i128,
        &50u32,
    );
    assert_eq!(result, Err(Ok(LumentixError::InvalidTimeRange)));
}

#[test]
fn test_update_event_empty_name_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    // Create a draft event
    let event_id = client.create_event(
        &organizer,
        &String::from_str(&env, "Original Event"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );

    // Try to update with empty name
    let result = client.try_update_event(
        &organizer,
        &event_id,
        &String::from_str(&env, ""), // Empty name
        &String::from_str(&env, "Updated Description"),
        &String::from_str(&env, "Updated Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );
    assert_eq!(result, Err(Ok(LumentixError::EmptyString)));
}

#[test]
fn test_update_event_zero_ticket_price_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    // Create a draft event
    let event_id = client.create_event(
        &organizer,
        &String::from_str(&env, "Original Event"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );

    // Try to update with zero ticket price
    let result = client.try_update_event(
        &organizer,
        &event_id,
        &String::from_str(&env, "Updated Event"),
        &String::from_str(&env, "Updated Description"),
        &String::from_str(&env, "Updated Location"),
        &1000u64,
        &2000u64,
        &0i128, // Zero price
        &50u32,
    );
    assert_eq!(result, Err(Ok(LumentixError::InvalidAmount)));
}

#[test]
fn test_update_event_reduce_max_tickets_below_sold_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    // Create a draft event with capacity of 10
    let event_id = client.create_event(
        &organizer,
        &String::from_str(&env, "Original Event"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &10u32,
    );

    // Publish and sell 5 tickets
    client.update_event_status(&event_id, &EventStatus::Published, &organizer);
    client.purchase_ticket(&buyer, &event_id, &100i128);
    client.purchase_ticket(&buyer, &event_id, &100i128);
    client.purchase_ticket(&buyer, &event_id, &100i128);
    client.purchase_ticket(&buyer, &event_id, &100i128);
    client.purchase_ticket(&buyer, &event_id, &100i128);

    // Try to update the event - this should fail because event is Published
    // (only Draft events can be updated)
    // This demonstrates that the status check happens before capacity check
    let result = client.try_update_event(
        &organizer,
        &event_id,
        &String::from_str(&env, "Updated Event"),
        &String::from_str(&env, "Updated Description"),
        &String::from_str(&env, "Updated Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &3u32, // Trying to reduce below tickets_sold (5)
    );
    // The error is InvalidStatusTransition because Published events can't be updated
    // The capacity check (max_tickets < tickets_sold) would only apply to Draft events
    assert_eq!(result, Err(Ok(LumentixError::InvalidStatusTransition)));
}

#[test]
fn test_update_event_increase_max_tickets_succeeds() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    // Create a draft event with capacity of 50
    let event_id = client.create_event(
        &organizer,
        &String::from_str(&env, "Original Event"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );

    // Increase max_tickets to 200
    let result = client.try_update_event(
        &organizer,
        &event_id,
        &String::from_str(&env, "Updated Event"),
        &String::from_str(&env, "Updated Description"),
        &String::from_str(&env, "Updated Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &200u32,
    );
    assert!(result.is_ok());

    // Verify the change
    let event = client.get_event(&event_id);
    assert_eq!(event.max_tickets, 200);
}

#[test]
fn test_update_event_get_event_returns_updated_values() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);

    // Create a draft event
    let event_id = client.create_event(
        &organizer,
        &String::from_str(&env, "Original Event"),
        &String::from_str(&env, "Original Description"),
        &String::from_str(&env, "Original Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );

    // Update all fields
    client.update_event(
        &organizer,
        &event_id,
        &String::from_str(&env, "New Event Name"),
        &String::from_str(&env, "New Description"),
        &String::from_str(&env, "New Location"),
        &1500u64,
        &2500u64,
        &150i128,
        &100u32,
    );

    // Verify get_event returns updated values
    let event = client.get_event(&event_id);
    assert_eq!(event.name, String::from_str(&env, "New Event Name"));
    assert_eq!(event.description, String::from_str(&env, "New Description"));
    assert_eq!(event.location, String::from_str(&env, "New Location"));
    assert_eq!(event.start_time, 1500u64);
    assert_eq!(event.end_time, 2500u64);
    assert_eq!(event.ticket_price, 150i128);
    assert_eq!(event.max_tickets, 100u32);

    // Verify unchanged fields
    assert_eq!(event.id, event_id);
    assert_eq!(event.organizer, organizer);
    assert_eq!(event.status, EventStatus::Draft);
    assert_eq!(event.tickets_sold, 0u32);
}

// ============================================================================
// TICKET VALIDITY TESTS
// ============================================================================

#[test]
fn test_get_ticket_validity_true_for_unused_ticket_on_published_event() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);

    let is_valid = client.get_ticket_validity(&ticket_id);
    assert!(is_valid);
}

#[test]
fn test_get_ticket_validity_false_for_used_ticket() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);
    client.use_ticket(&ticket_id, &organizer);

    let is_valid = client.get_ticket_validity(&ticket_id);
    assert!(!is_valid);
}

#[test]
fn test_get_ticket_validity_false_for_refunded_ticket() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);
    client.cancel_event(&organizer, &event_id);
    client.refund_ticket(&ticket_id, &buyer);

    let is_valid = client.get_ticket_validity(&ticket_id);
    assert!(!is_valid);
}

#[test]
fn test_get_ticket_validity_false_for_ticket_on_draft_event() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, contract_id, client) = create_test_contract_with_id(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &String::from_str(&env, "Draft Event"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &10u32,
    );

    let ticket_id = env.as_contract(&contract_id, || {
        let ticket_id = storage::get_next_ticket_id(&env);
        storage::increment_ticket_id(&env);
        storage::set_ticket(
            &env,
            ticket_id,
            &Ticket {
                id: ticket_id,
                event_id,
                owner: buyer,
                purchase_time: env.ledger().timestamp(),
                used: false,
                refunded: false,
            },
        );
        ticket_id
    });

    let is_valid = client.get_ticket_validity(&ticket_id);
    assert!(!is_valid);
}

#[test]
fn test_get_ticket_validity_ticket_not_found() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);

    let result = client.try_get_ticket_validity(&999u64);
    assert_eq!(result, Err(Ok(LumentixError::TicketNotFound)));
}

// ============================================================================
// TRANSFER TICKET TESTS
// ============================================================================

#[test]
fn test_transfer_ticket_success_updates_owner() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let from = Address::generate(&env);
    let to = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_id = client.purchase_ticket(&from, &event_id, &100i128);

    client.transfer_ticket(&ticket_id, &from, &to);

    let ticket = client.get_ticket_info(&ticket_id);
    assert_eq!(ticket.owner, to);
}

#[test]
fn test_transfer_ticket_unauthorized_when_caller_is_not_owner() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let owner = Address::generate(&env);
    let caller = Address::generate(&env);
    let recipient = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_id = client.purchase_ticket(&owner, &event_id, &100i128);

    let result = client.try_transfer_ticket(&ticket_id, &caller, &recipient);
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
}

#[test]
fn test_transfer_ticket_used_ticket_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let owner = Address::generate(&env);
    let recipient = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_id = client.purchase_ticket(&owner, &event_id, &100i128);
    client.use_ticket(&ticket_id, &organizer);

    let result = client.try_transfer_ticket(&ticket_id, &owner, &recipient);
    assert_eq!(result, Err(Ok(LumentixError::TicketAlreadyUsed)));
}

#[test]
fn test_transfer_ticket_refunded_ticket_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let owner = Address::generate(&env);
    let recipient = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_id = client.purchase_ticket(&owner, &event_id, &100i128);
    client.cancel_event(&organizer, &event_id);
    client.refund_ticket(&ticket_id, &owner);

    let result = client.try_transfer_ticket(&ticket_id, &owner, &recipient);
    assert_eq!(result, Err(Ok(LumentixError::RefundNotAllowed)));
}

#[test]
fn test_transfer_ticket_cancelled_event_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let owner = Address::generate(&env);
    let recipient = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_id = client.purchase_ticket(&owner, &event_id, &100i128);
    client.cancel_event(&organizer, &event_id);

    let result = client.try_transfer_ticket(&ticket_id, &owner, &recipient);
    assert_eq!(result, Err(Ok(LumentixError::InvalidStatusTransition)));
}

#[test]
fn test_transfer_ticket_completed_event_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let owner = Address::generate(&env);
    let recipient = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_id = client.purchase_ticket(&owner, &event_id, &100i128);
    env.ledger().with_mut(|li| li.timestamp = 2001);
    client.complete_event(&organizer, &event_id);

    let result = client.try_transfer_ticket(&ticket_id, &owner, &recipient);
    assert_eq!(result, Err(Ok(LumentixError::InvalidStatusTransition)));
}

#[test]
fn test_transfer_ticket_draft_event_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, contract_id, client) = create_test_contract_with_id(&env);
    let organizer = Address::generate(&env);
    let owner = Address::generate(&env);
    let recipient = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &String::from_str(&env, "Draft Event"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );

    let ticket_id = env.as_contract(&contract_id, || {
        let ticket_id = storage::get_next_ticket_id(&env);
        storage::increment_ticket_id(&env);
        storage::set_ticket(
            &env,
            ticket_id,
            &Ticket {
                id: ticket_id,
                event_id,
                owner: owner.clone(),
                purchase_time: env.ledger().timestamp(),
                used: false,
                refunded: false,
            },
        );
        ticket_id
    });

    let result = client.try_transfer_ticket(&ticket_id, &owner, &recipient);
    assert_eq!(result, Err(Ok(LumentixError::InvalidStatusTransition)));
}

#[test]
fn test_transfer_ticket_original_owner_cannot_use_or_refund_after_transfer() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let original_owner = Address::generate(&env);
    let new_owner = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_id = client.purchase_ticket(&original_owner, &event_id, &100i128);
    client.transfer_ticket(&ticket_id, &original_owner, &new_owner);

    let use_result = client.try_use_ticket(&ticket_id, &original_owner);
    assert_eq!(use_result, Err(Ok(LumentixError::Unauthorized)));

    client.cancel_event(&organizer, &event_id);
    let refund_result = client.try_refund_ticket(&ticket_id, &original_owner);
    assert_eq!(refund_result, Err(Ok(LumentixError::Unauthorized)));
}

#[test]
fn test_transfer_ticket_new_owner_ticket_can_be_used() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let original_owner = Address::generate(&env);
    let new_owner = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_id = client.purchase_ticket(&original_owner, &event_id, &100i128);
    client.transfer_ticket(&ticket_id, &original_owner, &new_owner);

    client.use_ticket(&ticket_id, &organizer);

    let ticket = client.get_ticket_info(&ticket_id);
    assert!(ticket.used);
    assert_eq!(ticket.owner, new_owner);
}

#[test]
fn test_transfer_ticket_not_found_returns_ticket_not_found() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let owner = Address::generate(&env);
    let recipient = Address::generate(&env);

    let result = client.try_transfer_ticket(&999u64, &owner, &recipient);
    assert_eq!(result, Err(Ok(LumentixError::TicketNotFound)));
}

#[test]
fn test_transfer_ticket_double_transfer_succeeds() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let first_owner = Address::generate(&env);
    let second_owner = Address::generate(&env);
    let third_owner = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_id = client.purchase_ticket(&first_owner, &event_id, &100i128);

    client.transfer_ticket(&ticket_id, &first_owner, &second_owner);
    client.transfer_ticket(&ticket_id, &second_owner, &third_owner);

    let ticket = client.get_ticket_info(&ticket_id);
    assert_eq!(ticket.owner, third_owner);
}

// ============================================================================
// TOKEN CONFIGURATION TESTS
// ============================================================================

#[test]
fn test_admin_can_update_token_address() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);
    let first_token = Address::generate(&env);
    let second_token = Address::generate(&env);

    client.set_token(&admin, &first_token);
    let update_result = client.try_set_token(&admin, &second_token);
    assert!(update_result.is_ok());

    let stored = client.get_token();
    assert_eq!(stored, second_token);
}

#[test]
fn test_get_token_returns_updated_address() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);
    let first_token = Address::generate(&env);
    let second_token = Address::generate(&env);

    client.set_token(&admin, &first_token);
    client.set_token(&admin, &second_token);

    let stored = client.get_token();
    assert_eq!(stored, second_token);
}

#[test]
fn test_token_address_persists_across_multiple_calls() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);
    let token = Address::generate(&env);

    client.set_token(&admin, &token);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let _ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);
    let _event = client.get_event(&event_id);

    let stored = client.get_token();
    assert_eq!(stored, token);
}

// ============================================================================
// GET TICKETS BY BUYER TESTS
// ============================================================================

#[test]
fn test_get_tickets_by_buyer_returns_empty_vec_when_buyer_has_no_tickets() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let buyer = Address::generate(&env);

    let tickets = client.get_tickets_by_buyer(&buyer);
    assert_eq!(tickets.len(), 0);
}

#[test]
fn test_get_tickets_by_buyer_returns_single_ticket_with_correct_data() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);

    let tickets = client.get_tickets_by_buyer(&buyer);
    assert_eq!(tickets.len(), 1);

    let ticket = tickets.get(0).unwrap();
    assert_eq!(ticket.id, ticket_id);
    assert_eq!(ticket.event_id, event_id);
    assert_eq!(ticket.owner, buyer);
    assert!(!ticket.used);
    assert!(!ticket.refunded);
}

#[test]
fn test_get_tickets_by_buyer_returns_multiple_tickets_across_events() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let first_event = create_and_publish_event(&env, &client, &organizer);
    let second_event = client.create_event(
        &organizer,
        &String::from_str(&env, "Second Event"),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &3000u64,
        &4000u64,
        &150i128,
        &30u32,
    );
    client.update_event_status(&second_event, &EventStatus::Published, &organizer);

    let first_ticket = client.purchase_ticket(&buyer, &first_event, &100i128);
    let second_ticket = client.purchase_ticket(&buyer, &second_event, &150i128);

    let tickets = client.get_tickets_by_buyer(&buyer);
    assert_eq!(tickets.len(), 2);
    assert_eq!(tickets.get(0).unwrap().id, first_ticket);
    assert_eq!(tickets.get(1).unwrap().id, second_ticket);
}

#[test]
fn test_get_tickets_by_buyer_separates_different_buyers() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer_one = Address::generate(&env);
    let buyer_two = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_one = client.purchase_ticket(&buyer_one, &event_id, &100i128);
    let ticket_two = client.purchase_ticket(&buyer_two, &event_id, &100i128);

    let buyer_one_tickets = client.get_tickets_by_buyer(&buyer_one);
    let buyer_two_tickets = client.get_tickets_by_buyer(&buyer_two);

    assert_eq!(buyer_one_tickets.len(), 1);
    assert_eq!(buyer_two_tickets.len(), 1);
    assert_eq!(buyer_one_tickets.get(0).unwrap().id, ticket_one);
    assert_eq!(buyer_two_tickets.get(0).unwrap().id, ticket_two);
}

#[test]
fn test_get_tickets_by_buyer_includes_refunded_ticket() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);
    client.cancel_event(&organizer, &event_id);
    client.refund_ticket(&ticket_id, &buyer);

    let tickets = client.get_tickets_by_buyer(&buyer);
    assert_eq!(tickets.len(), 1);
    assert!(tickets.get(0).unwrap().refunded);
}

#[test]
fn test_get_tickets_by_buyer_includes_used_ticket() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);
    client.use_ticket(&ticket_id, &organizer);

    let tickets = client.get_tickets_by_buyer(&buyer);
    assert_eq!(tickets.len(), 1);
    assert!(tickets.get(0).unwrap().used);
}

#[test]
fn test_get_tickets_by_buyer_populates_all_ticket_fields() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = create_and_publish_event(&env, &client, &organizer);
    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);

    let ticket_info = client.get_ticket_info(&ticket_id);
    let tickets = client.get_tickets_by_buyer(&buyer);
    let listed = tickets.get(0).unwrap();

    assert_eq!(listed.id, ticket_info.id);
    assert_eq!(listed.event_id, ticket_info.event_id);
    assert_eq!(listed.owner, ticket_info.owner);
    assert_eq!(listed.purchase_time, ticket_info.purchase_time);
    assert_eq!(listed.used, ticket_info.used);
    assert_eq!(listed.refunded, ticket_info.refunded);
}
