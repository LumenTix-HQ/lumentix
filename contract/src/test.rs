#![cfg(test)]

use crate::error::LumentixError;
use crate::lumentix_contract::{LumentixContract, LumentixContractClient};
use crate::types::EventStatus;
use soroban_sdk::{testutils::Address as _, testutils::Ledger, Address, Env, String};

fn create_test_contract(env: &Env) -> (Address, LumentixContractClient<'_>) {
    let contract_id = env.register(LumentixContract, ());
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
