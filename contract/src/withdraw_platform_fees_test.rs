//! Boundary and edge-case tests for [`withdraw_platform_fees`](crate::lumentix_contract::LumentixContract::withdraw_platform_fees).
//!
//! Product/issue language sometimes refers to this operation as **withdrawing protocol funds** from the platform
//! pool (admin-only). There is no separate `withdraw_funds` symbol in this crate; organizer-facing escrow release is
//! [`release_escrow`](crate::lumentix_contract::LumentixContract::release_escrow).

use crate::error::LumentixError;
use crate::lumentix_contract::{LumentixContract, LumentixContractClient};
use crate::storage;
use crate::types::EventStatus;
use soroban_sdk::{
    testutils::{Address as _, Events},
    xdr::{self, ContractEventBody},
    Address, Env, String,
};

fn setup(env: &Env) -> (Address, Address, LumentixContractClient<'_>) {
    env.mock_all_auths();
    let contract_id = env.register(LumentixContract, ());
    let client = LumentixContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(&admin);
    (admin, contract_id, client)
}

fn publish_event(
    env: &Env,
    client: &LumentixContractClient,
    organizer: &Address,
) -> u64 {
    let event_id = client.create_event(
        organizer,
        &String::from_str(env, "Withdraw boundary event"),
        &String::from_str(env, "Desc"),
        &String::from_str(env, "Here"),
        &1000u64,
        &2000u64,
        &100i128,
        &50u32,
    );
    client.update_event_status(&event_id, &EventStatus::Published, organizer);
    event_id
}

fn event_has_fee_withdrawn(env: &Env) -> bool {
    for xdr_event in env.events().all().events() {
        if let ContractEventBody::V0(body) = &xdr_event.body {
            if let xdr::ScVal::Symbol(topic_sym) = &body.topics[0] {
                if topic_sym.as_slice() == b"feewith" {
                    return true;
                }
            }
        }
    }
    false
}

#[test]
fn withdraw_platform_fees_injected_i128_max_succeeds_and_clears() {
    let env = Env::default();
    let (admin, contract_id, client) = setup(&env);

    env.as_contract(&contract_id, || {
        storage::add_platform_balance(&env, i128::MAX);
    });
    assert_eq!(client.get_platform_balance(), i128::MAX);

    let withdrawn = client.withdraw_platform_fees(&admin);
    assert_eq!(withdrawn, i128::MAX);
    assert_eq!(client.get_platform_balance(), 0i128);
}

#[test]
fn withdraw_platform_fees_second_call_errors_no_platform_fees() {
    let env = Env::default();
    let (admin, contract_id, client) = setup(&env);

    env.as_contract(&contract_id, || {
        storage::add_platform_balance(&env, 1i128);
    });

    assert_eq!(client.withdraw_platform_fees(&admin), 1i128);
    let second = client.try_withdraw_platform_fees(&admin);
    assert_eq!(second, Err(Ok(LumentixError::NoPlatformFees)));
}

#[test]
fn withdraw_platform_fees_unauthorized_does_not_clear_balance() {
    let env = Env::default();
    let (admin, contract_id, client) = setup(&env);
    let attacker = Address::generate(&env);

    env.as_contract(&contract_id, || {
        storage::add_platform_balance(&env, 10_000i128);
    });

    let res = client.try_withdraw_platform_fees(&attacker);
    assert_eq!(res, Err(Ok(LumentixError::Unauthorized)));
    assert_eq!(client.get_platform_balance(), 10_000i128);

    assert_eq!(client.withdraw_platform_fees(&admin), 10_000i128);
}

#[test]
fn withdraw_platform_fees_min_balance_one() {
    let env = Env::default();
    let (admin, contract_id, client) = setup(&env);

    env.as_contract(&contract_id, || {
        storage::add_platform_balance(&env, 1i128);
    });

    assert_eq!(client.withdraw_platform_fees(&admin), 1i128);
    assert_eq!(client.get_platform_balance(), 0i128);
}

#[test]
fn withdraw_platform_fees_does_not_touch_escrow() {
    let env = Env::default();
    let (admin, contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    client.set_platform_fee(&admin, &1000u32);
    let event_id = publish_event(&env, &client, &organizer);
    client.purchase_ticket(&buyer, &event_id, &100i128);

    let escrow_before = client.get_escrow_balance(&event_id);
    let withdrawn = client.withdraw_platform_fees(&admin);
    assert_eq!(withdrawn, 10i128);
    assert_eq!(client.get_escrow_balance(&event_id), escrow_before);
}

#[test]
fn withdraw_platform_fees_max_bps_accumulation_then_full_withdraw() {
    let env = Env::default();
    let (admin, _contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    client.set_platform_fee(&admin, &10_000u32);
    let event_id = publish_event(&env, &client, &organizer);

    for _ in 0..50 {
        client.purchase_ticket(&buyer, &event_id, &100i128);
    }

    assert_eq!(client.get_platform_balance(), 5_000i128);
    assert_eq!(client.withdraw_platform_fees(&admin), 5_000i128);
    assert_eq!(client.get_platform_balance(), 0i128);
}

#[test]
fn withdraw_platform_fees_re_accumulate_after_empty() {
    let env = Env::default();
    let (admin, _contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);

    client.set_platform_fee(&admin, &500u32);
    let event_id = publish_event(&env, &client, &organizer);

    client.purchase_ticket(&buyer, &event_id, &100i128);
    assert_eq!(client.withdraw_platform_fees(&admin), 5i128);

    client.purchase_ticket(&buyer, &event_id, &100i128);
    assert_eq!(client.withdraw_platform_fees(&admin), 5i128);
    assert_eq!(client.get_platform_balance(), 0i128);
}

#[test]
fn withdraw_platform_fees_emits_event_at_large_balance() {
    let env = Env::default();
    let (admin, contract_id, client) = setup(&env);

    env.as_contract(&contract_id, || {
        storage::add_platform_balance(&env, i128::MAX - 1);
    });

    let _ = client.withdraw_platform_fees(&admin);
    assert!(
        event_has_fee_withdrawn(&env),
        "PlatformFeesWithdrawn should be emitted for large withdrawals"
    );
}

#[test]
fn withdraw_platform_fees_many_small_adds_consistent_total() {
    let env = Env::default();
    let (admin, contract_id, client) = setup(&env);

    env.as_contract(&contract_id, || {
        for _ in 0..1000 {
            storage::add_platform_balance(&env, 1_000_000i128);
        }
    });

    let expected = 1_000_000i128 * 1000i128;
    assert_eq!(client.get_platform_balance(), expected);
    assert_eq!(client.withdraw_platform_fees(&admin), expected);
}
