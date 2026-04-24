/// Tests for get_protocol_fee: unit tests and boundary/edge case tests.
///
/// Covers:
///   - Successful retrieval of fee percentage and fee recipient
///   - Default fee (0 bps) before any set_platform_fee call
///   - NotInitialized error when contract is not initialized
///   - Max valid fee (10000 bps = 100%)
///   - Boundary: fee just below max (9999 bps)
///   - Fee recipient is always the admin address
///   - Diagnostic event (ProtocolFeeQueried) is emitted on each call
///   - Multiple sequential calls each emit an event
///   - Fee reflects latest set_platform_fee value
///   - deposit_funds: success, unauthorized, invalid amount, cancelled event, not initialized
use crate::error::LumentixError;
use crate::lumentix_contract::{LumentixContract, LumentixContractClient};
use soroban_sdk::{
    testutils::{Address as _, Events, Ledger},
    Address, Env,
};

// ─── helpers ────────────────────────────────────────────────────────────────

fn setup_initialized(env: &Env) -> (Address, LumentixContractClient<'_>) {
    let contract_id = env.register(LumentixContract, ());
    let client = LumentixContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(&admin);
    (admin, client)
}

// ─── Unit Tests: get_protocol_fee ───────────────────────────────────────────

#[test]
fn test_get_protocol_fee_default_zero() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_initialized(&env);

    let (fee_bps, recipient) = client.get_protocol_fee();
    assert_eq!(fee_bps, 0, "default fee should be 0 bps");
    assert_eq!(recipient, admin, "fee recipient should be admin");
}

#[test]
fn test_get_protocol_fee_after_set() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_initialized(&env);
    client.set_platform_fee(&admin, &250u32);

    let (fee_bps, recipient) = client.get_protocol_fee();
    assert_eq!(fee_bps, 250);
    assert_eq!(recipient, admin);
}

#[test]
fn test_get_protocol_fee_recipient_is_admin() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_initialized(&env);
    client.set_platform_fee(&admin, &500u32);

    let (_fee, recipient) = client.get_protocol_fee();
    assert_eq!(recipient, admin);
}

#[test]
fn test_get_protocol_fee_not_initialized() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(LumentixContract, ());
    let client = LumentixContractClient::new(&env, &contract_id);

    let result = client.try_get_protocol_fee();
    assert_eq!(result, Err(Ok(LumentixError::NotInitialized)));
}

#[test]
fn test_get_protocol_fee_reflects_latest_value() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_initialized(&env);

    client.set_platform_fee(&admin, &100u32);
    let (fee1, _) = client.get_protocol_fee();
    assert_eq!(fee1, 100);

    client.set_platform_fee(&admin, &750u32);
    let (fee2, _) = client.get_protocol_fee();
    assert_eq!(fee2, 750);
}

#[test]
fn test_get_protocol_fee_recipient_updates_after_admin_change() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_initialized(&env);
    let new_admin = Address::generate(&env);

    client.change_admin(&admin, &new_admin);

    let (_fee, recipient) = client.get_protocol_fee();
    assert_eq!(recipient, new_admin, "recipient should reflect new admin");
}

// ─── Diagnostic Event Tests ──────────────────────────────────────────────────

#[test]
fn test_get_protocol_fee_emits_event() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_initialized(&env);
    client.set_platform_fee(&admin, &300u32);

    client.get_protocol_fee();

    // At least one event should have been emitted (the ProtocolFeeQueried event)
    let events = env.events().all();
    assert!(
        !events.events().is_empty(),
        "at least one event should have been emitted"
    );
}

#[test]
fn test_get_protocol_fee_emits_event_each_call() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_initialized(&env);
    client.set_platform_fee(&admin, &100u32);

    // Each call should emit a ProtocolFeeQueried event.
    // We verify by checking that events are non-empty after each individual call.
    client.get_protocol_fee();
    assert!(
        !env.events().all().events().is_empty(),
        "first call should emit an event"
    );

    client.get_protocol_fee();
    assert!(
        !env.events().all().events().is_empty(),
        "second call should emit an event"
    );

    client.get_protocol_fee();
    assert!(
        !env.events().all().events().is_empty(),
        "third call should emit an event"
    );
}

// ─── Boundary & Edge Case Tests: get_protocol_fee ───────────────────────────

#[test]
fn test_get_protocol_fee_max_valid_fee() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_initialized(&env);
    // 10000 bps = 100% — maximum valid value
    client.set_platform_fee(&admin, &10000u32);

    let (fee_bps, recipient) = client.get_protocol_fee();
    assert_eq!(fee_bps, 10000);
    assert_eq!(recipient, admin);
}

#[test]
fn test_get_protocol_fee_just_below_max() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_initialized(&env);
    client.set_platform_fee(&admin, &9999u32);

    let (fee_bps, _) = client.get_protocol_fee();
    assert_eq!(fee_bps, 9999);
}

#[test]
fn test_get_protocol_fee_min_valid_fee() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_initialized(&env);
    // 0 bps = 0% — minimum valid value
    client.set_platform_fee(&admin, &0u32);

    let (fee_bps, _) = client.get_protocol_fee();
    assert_eq!(fee_bps, 0);
}

#[test]
fn test_set_platform_fee_overflow_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_initialized(&env);
    // 10001 bps exceeds 100% — must be rejected
    let result = client.try_set_platform_fee(&admin, &10001u32);
    assert_eq!(result, Err(Ok(LumentixError::InvalidPlatformFee)));

    // Fee should remain at default 0
    let (fee_bps, _) = client.get_protocol_fee();
    assert_eq!(fee_bps, 0, "fee must not change after rejected set");
}

#[test]
fn test_set_platform_fee_max_u32_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_initialized(&env);
    let result = client.try_set_platform_fee(&admin, &u32::MAX);
    assert_eq!(result, Err(Ok(LumentixError::InvalidPlatformFee)));
}

#[test]
fn test_get_protocol_fee_unauthorized_set_does_not_change_fee() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_initialized(&env);
    client.set_platform_fee(&admin, &200u32);

    let attacker = Address::generate(&env);
    let _ = client.try_set_platform_fee(&attacker, &9999u32);

    let (fee_bps, _) = client.get_protocol_fee();
    assert_eq!(
        fee_bps, 200,
        "fee must not change after unauthorized attempt"
    );
}

#[test]
fn test_get_protocol_fee_fee_calculation_at_max() {
    // Verify that a 100% fee (10000 bps) correctly takes the full ticket price
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_initialized(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    client.set_platform_fee(&admin, &10000u32);

    let event_id = client.create_event(
        &organizer,
        &soroban_sdk::String::from_str(&env, "Max Fee Event"),
        &soroban_sdk::String::from_str(&env, "Desc"),
        &soroban_sdk::String::from_str(&env, "Loc"),
        &1000u64,
        &2000u64,
        &100i128,
        &10u32,
    );
    client.update_event_status(&event_id, &crate::types::EventStatus::Published, &organizer);
    client.purchase_ticket(&buyer, &event_id, &100i128);

    // At 100% fee, entire amount goes to platform, escrow gets 0
    assert_eq!(client.get_platform_balance(), 100i128);
    assert_eq!(client.get_escrow_balance(&event_id), 0i128);
}

#[test]
fn test_get_protocol_fee_fee_calculation_at_zero() {
    // Verify that a 0% fee leaves the full amount in escrow
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_initialized(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &soroban_sdk::String::from_str(&env, "Zero Fee Event"),
        &soroban_sdk::String::from_str(&env, "Desc"),
        &soroban_sdk::String::from_str(&env, "Loc"),
        &1000u64,
        &2000u64,
        &100i128,
        &10u32,
    );
    client.update_event_status(&event_id, &crate::types::EventStatus::Published, &organizer);
    client.purchase_ticket(&buyer, &event_id, &100i128);

    assert_eq!(client.get_platform_balance(), 0i128);
    assert_eq!(client.get_escrow_balance(&event_id), 100i128);
}

// ─── Unit Tests: deposit_funds ───────────────────────────────────────────────

#[test]
fn test_deposit_funds_success_by_organizer() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_initialized(&env);
    let organizer = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &soroban_sdk::String::from_str(&env, "Deposit Event"),
        &soroban_sdk::String::from_str(&env, "Desc"),
        &soroban_sdk::String::from_str(&env, "Loc"),
        &1000u64,
        &2000u64,
        &100i128,
        &10u32,
    );

    let new_balance = client.deposit_funds(&organizer, &event_id, &500i128);
    assert_eq!(new_balance, 500i128);
    assert_eq!(client.get_escrow_balance(&event_id), 500i128);
}

#[test]
fn test_deposit_funds_success_by_admin() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_initialized(&env);
    let organizer = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &soroban_sdk::String::from_str(&env, "Admin Deposit"),
        &soroban_sdk::String::from_str(&env, "Desc"),
        &soroban_sdk::String::from_str(&env, "Loc"),
        &1000u64,
        &2000u64,
        &100i128,
        &10u32,
    );

    let new_balance = client.deposit_funds(&admin, &event_id, &1000i128);
    assert_eq!(new_balance, 1000i128);
}

#[test]
fn test_deposit_funds_accumulates() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_initialized(&env);
    let organizer = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &soroban_sdk::String::from_str(&env, "Accumulate"),
        &soroban_sdk::String::from_str(&env, "Desc"),
        &soroban_sdk::String::from_str(&env, "Loc"),
        &1000u64,
        &2000u64,
        &100i128,
        &10u32,
    );

    client.deposit_funds(&organizer, &event_id, &200i128);
    client.deposit_funds(&organizer, &event_id, &300i128);
    let balance = client.deposit_funds(&organizer, &event_id, &500i128);
    assert_eq!(balance, 1000i128);
}

#[test]
fn test_deposit_funds_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_initialized(&env);
    let organizer = Address::generate(&env);
    let stranger = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &soroban_sdk::String::from_str(&env, "Unauth Deposit"),
        &soroban_sdk::String::from_str(&env, "Desc"),
        &soroban_sdk::String::from_str(&env, "Loc"),
        &1000u64,
        &2000u64,
        &100i128,
        &10u32,
    );

    let result = client.try_deposit_funds(&stranger, &event_id, &100i128);
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
}

#[test]
fn test_deposit_funds_invalid_amount_zero() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_initialized(&env);
    let organizer = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &soroban_sdk::String::from_str(&env, "Zero Deposit"),
        &soroban_sdk::String::from_str(&env, "Desc"),
        &soroban_sdk::String::from_str(&env, "Loc"),
        &1000u64,
        &2000u64,
        &100i128,
        &10u32,
    );

    let result = client.try_deposit_funds(&organizer, &event_id, &0i128);
    assert_eq!(result, Err(Ok(LumentixError::InvalidAmount)));
}

#[test]
fn test_deposit_funds_invalid_amount_negative() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_initialized(&env);
    let organizer = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &soroban_sdk::String::from_str(&env, "Neg Deposit"),
        &soroban_sdk::String::from_str(&env, "Desc"),
        &soroban_sdk::String::from_str(&env, "Loc"),
        &1000u64,
        &2000u64,
        &100i128,
        &10u32,
    );

    let result = client.try_deposit_funds(&organizer, &event_id, &-1i128);
    assert_eq!(result, Err(Ok(LumentixError::InvalidAmount)));
}

#[test]
fn test_deposit_funds_cancelled_event_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_initialized(&env);
    let organizer = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &soroban_sdk::String::from_str(&env, "Cancel Deposit"),
        &soroban_sdk::String::from_str(&env, "Desc"),
        &soroban_sdk::String::from_str(&env, "Loc"),
        &1000u64,
        &2000u64,
        &100i128,
        &10u32,
    );
    client.update_event_status(&event_id, &crate::types::EventStatus::Published, &organizer);
    client.cancel_event(&organizer, &event_id);

    let result = client.try_deposit_funds(&organizer, &event_id, &100i128);
    assert_eq!(result, Err(Ok(LumentixError::InvalidStatusTransition)));
}

#[test]
fn test_deposit_funds_event_not_found() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_initialized(&env);

    let result = client.try_deposit_funds(&admin, &9999u64, &100i128);
    assert_eq!(result, Err(Ok(LumentixError::EventNotFound)));
}

#[test]
fn test_deposit_funds_not_initialized() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(LumentixContract, ());
    let client = LumentixContractClient::new(&env, &contract_id);
    let depositor = Address::generate(&env);

    let result = client.try_deposit_funds(&depositor, &1u64, &100i128);
    assert_eq!(result, Err(Ok(LumentixError::NotInitialized)));
}

#[test]
fn test_deposit_funds_emits_event() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_initialized(&env);
    let organizer = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &soroban_sdk::String::from_str(&env, "Emit Deposit"),
        &soroban_sdk::String::from_str(&env, "Desc"),
        &soroban_sdk::String::from_str(&env, "Loc"),
        &1000u64,
        &2000u64,
        &100i128,
        &10u32,
    );

    client.deposit_funds(&organizer, &event_id, &250i128);

    let events = env.events().all();
    assert!(!events.events().is_empty(), "deposit should emit an event");
}

// ─── Boundary & Edge Case Tests: deposit_funds ───────────────────────────────

#[test]
fn test_deposit_funds_minimum_valid_amount() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_initialized(&env);
    let organizer = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &soroban_sdk::String::from_str(&env, "Min Deposit"),
        &soroban_sdk::String::from_str(&env, "Desc"),
        &soroban_sdk::String::from_str(&env, "Loc"),
        &1000u64,
        &2000u64,
        &100i128,
        &10u32,
    );

    let balance = client.deposit_funds(&organizer, &event_id, &1i128);
    assert_eq!(balance, 1i128);
}

#[test]
fn test_deposit_funds_large_amount() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_initialized(&env);
    let organizer = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &soroban_sdk::String::from_str(&env, "Large Deposit"),
        &soroban_sdk::String::from_str(&env, "Desc"),
        &soroban_sdk::String::from_str(&env, "Loc"),
        &1000u64,
        &2000u64,
        &100i128,
        &10u32,
    );

    // Large but valid i128 value
    let large_amount: i128 = 1_000_000_000_000i128;
    let balance = client.deposit_funds(&organizer, &event_id, &large_amount);
    assert_eq!(balance, large_amount);
}

#[test]
fn test_deposit_funds_into_completed_event_allowed() {
    // Completed events can still receive deposits (e.g., late sponsor contributions)
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_initialized(&env);
    let organizer = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &soroban_sdk::String::from_str(&env, "Completed Deposit"),
        &soroban_sdk::String::from_str(&env, "Desc"),
        &soroban_sdk::String::from_str(&env, "Loc"),
        &1000u64,
        &2000u64,
        &100i128,
        &10u32,
    );
    client.update_event_status(&event_id, &crate::types::EventStatus::Published, &organizer);
    env.ledger().with_mut(|li| li.timestamp = 2001);
    client.complete_event(&organizer, &event_id);

    let result = client.try_deposit_funds(&organizer, &event_id, &100i128);
    assert!(
        result.is_ok(),
        "deposit into completed event should succeed"
    );
}

#[test]
fn test_deposit_funds_maximum_i128_value() {
    // Test with maximum possible i128 value
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_initialized(&env);
    let organizer = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &soroban_sdk::String::from_str(&env, "Max Value Test"),
        &soroban_sdk::String::from_str(&env, "Desc"),
        &soroban_sdk::String::from_str(&env, "Loc"),
        &1000u64,
        &2000u64,
        &100i128,
        &10u32,
    );

    // Use maximum i128 value
    let max_i128: i128 = i128::MAX;
    let balance = client.deposit_funds(&organizer, &event_id, &max_i128);
    assert_eq!(balance, max_i128);
    assert_eq!(client.get_escrow_balance(&event_id), max_i128);
}

#[test]
fn test_deposit_funds_near_maximum_i128() {
    // Test with value near maximum to ensure no overflow
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_initialized(&env);
    let organizer = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &soroban_sdk::String::from_str(&env, "Near Max Test"),
        &soroban_sdk::String::from_str(&env, "Desc"),
        &soroban_sdk::String::from_str(&env, "Loc"),
        &1000u64,
        &2000u64,
        &100i128,
        &10u32,
    );

    // Use value close to max but with room for addition
    let near_max: i128 = i128::MAX - 1000;
    let balance = client.deposit_funds(&organizer, &event_id, &near_max);
    assert_eq!(balance, near_max);
    
    // Add another deposit to test overflow protection
    let additional = 500i128;
    let new_balance = client.deposit_funds(&organizer, &event_id, &additional);
    assert_eq!(new_balance, near_max + additional);
}

#[test]
fn test_deposit_funds_multiple_large_deposits() {
    // Test multiple large deposits to check for overflow in accumulation
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_initialized(&env);
    let organizer = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &soroban_sdk::String::from_str(&env, "Multi Large Test"),
        &soroban_sdk::String::from_str(&env, "Desc"),
        &soroban_sdk::String::from_str(&env, "Loc"),
        &1000u64,
        &2000u64,
        &100i128,
        &10u32,
    );

    // Make several large deposits
    let large_amount1: i128 = i128::MAX / 4;
    let large_amount2: i128 = i128::MAX / 4;
    let large_amount3: i128 = i128::MAX / 4;

    let balance1 = client.deposit_funds(&organizer, &event_id, &large_amount1);
    assert_eq!(balance1, large_amount1);

    let balance2 = client.deposit_funds(&organizer, &event_id, &large_amount2);
    assert_eq!(balance2, large_amount1 + large_amount2);

    let balance3 = client.deposit_funds(&organizer, &event_id, &large_amount3);
    assert_eq!(balance3, large_amount1 + large_amount2 + large_amount3);
}

#[test]
fn test_deposit_funds_zero_and_negative_boundary() {
    // Test boundary conditions for zero and negative amounts
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_initialized(&env);
    let organizer = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &soroban_sdk::String::from_str(&env, "Boundary Test"),
        &soroban_sdk::String::from_str(&env, "Desc"),
        &soroban_sdk::String::from_str(&env, "Loc"),
        &1000u64,
        &2000u64,
        &100i128,
        &10u32,
    );

    // Test zero amount (should fail)
    let result_zero = client.try_deposit_funds(&organizer, &event_id, &0i128);
    assert_eq!(result_zero, Err(Ok(LumentixError::InvalidAmount)));

    // Test negative amount (should fail)
    let result_negative = client.try_deposit_funds(&organizer, &event_id, &-1i128);
    assert_eq!(result_negative, Err(Ok(LumentixError::InvalidAmount)));

    // Test minimum positive amount (should succeed)
    let result_min_positive = client.deposit_funds(&organizer, &event_id, &1i128);
    assert_eq!(result_min_positive, 1i128);
}

#[test]
fn test_deposit_funds_extreme_small_amounts() {
    // Test with very small positive amounts
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_initialized(&env);
    let organizer = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &soroban_sdk::String::from_str(&env, "Small Amounts Test"),
        &soroban_sdk::String::from_str(&env, "Desc"),
        &soroban_sdk::String::from_str(&env, "Loc"),
        &1000u64,
        &2000u64,
        &100i128,
        &10u32,
    );

    // Test with smallest positive amounts
    let amounts = [1i128, 2i128, 3i128, 5i128, 10i128];
    let mut expected_balance = 0i128;
    
    for amount in amounts.iter() {
        expected_balance += amount;
        let balance = client.deposit_funds(&organizer, &event_id, amount);
        assert_eq!(balance, expected_balance);
    }
}

#[test]
fn test_deposit_funds_rapid_succession() {
    // Test many deposits in rapid succession to check for state consistency
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_initialized(&env);
    let organizer = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &soroban_sdk::String::from_str(&env, "Rapid Test"),
        &soroban_sdk::String::from_str(&env, "Desc"),
        &soroban_sdk::String::from_str(&env, "Loc"),
        &1000u64,
        &2000u64,
        &100i128,
        &10u32,
    );

    // Make 100 small deposits rapidly
    let mut expected_total = 0i128;
    for i in 1..=100 {
        let amount = i * 10i128; // 10, 20, 30, ..., 1000
        expected_total += amount;
        let balance = client.deposit_funds(&organizer, &event_id, &amount);
        assert_eq!(balance, expected_total);
    }
    
    // Verify final balance
    assert_eq!(client.get_escrow_balance(&event_id), expected_total);
}

#[test]
fn test_deposit_funds_alternating_large_small() {
    // Test alternating large and small deposits
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_initialized(&env);
    let organizer = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &soroban_sdk::String::from_str(&env, "Alternating Test"),
        &soroban_sdk::String::from_str(&env, "Desc"),
        &soroban_sdk::String::from_str(&env, "Loc"),
        &1000u64,
        &2000u64,
        &100i128,
        &10u32,
    );

    // Alternate between large and small amounts
    let deposits = [
        1_000_000i128, 1i128, 
        500_000i128, 2i128,
        100_000i128, 3i128,
        50_000i128, 4i128,
    ];
    
    let mut expected_balance = 0i128;
    for amount in deposits.iter() {
        expected_balance += amount;
        let balance = client.deposit_funds(&organizer, &event_id, amount);
        assert_eq!(balance, expected_balance);
    }
}

#[test]
fn test_deposit_funds_state_persistence() {
    // Test that deposit state persists correctly across multiple operations
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_initialized(&env);
    let organizer = Address::generate(&env);

    let event_id = client.create_event(
        &organizer,
        &soroban_sdk::String::from_str(&env, "Persistence Test"),
        &soroban_sdk::String::from_str(&env, "Desc"),
        &soroban_sdk::String::from_str(&env, "Loc"),
        &1000u64,
        &2000u64,
        &100i128,
        &10u32,
    );

    // Make initial deposits
    client.deposit_funds(&organizer, &event_id, &1000i128);
    client.deposit_funds(&organizer, &event_id, &2000i128);
    client.deposit_funds(&organizer, &event_id, &3000i128);
    
    let balance_before = client.get_escrow_balance(&event_id);
    assert_eq!(balance_before, 6000i128);

    // Publish the event first before ticket purchases
    client.update_event_status(&event_id, &crate::types::EventStatus::Published, &organizer);

    // Perform some other operations (ticket purchases, etc.)
    let buyer = Address::generate(&env);
    client.purchase_ticket(&buyer, &event_id, &100i128);
    
    // Check that escrow balance is updated correctly
    let balance_after_purchase = client.get_escrow_balance(&event_id);
    // Should be previous balance + ticket price - platform fee (0% fee = 100)
    assert_eq!(balance_after_purchase, 6100i128);
    
    // Continue depositing
    client.deposit_funds(&organizer, &event_id, &4000i128);
    let final_balance = client.get_escrow_balance(&event_id);
    assert_eq!(final_balance, 10100i128);
}
