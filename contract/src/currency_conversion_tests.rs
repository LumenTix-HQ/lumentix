#![allow(warnings)]
//! Tests for checkout currency conversion (#1500):
//! `fetch_live_exchange_rate`, `lock_exchange_rate`, `convert_checkout_currency`.

use crate::currency_conversion::{MAX_RATE_AGE, RATE_LOCK_DURATION, RATE_SCALE};
use crate::error::LumentixError;
use crate::lumentix_contract::{LumentixContract, LumentixContractClient};
use crate::types::EventStatus;
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Address, Env, String};

fn setup(env: &Env) -> (LumentixContractClient<'_>, Address) {
    env.mock_all_auths();
    let contract_id = env.register(LumentixContract, ());
    let client = LumentixContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(&admin);
    (client, admin)
}

fn usd(env: &Env) -> String {
    String::from_str(env, "USD")
}

fn eur(env: &Env) -> String {
    String::from_str(env, "EUR")
}

/// Event priced at 100 USD, with USD worth 1000 and EUR worth 2000 oracle units
/// (one EUR buys two USD).
fn priced_event(env: &Env) -> (LumentixContractClient<'_>, Address, Address, u64) {
    let (client, admin) = setup(env);
    client.set_currency_oracle(&admin, &usd(env), &7u32, &1_000i128);
    client.set_currency_oracle(&admin, &eur(env), &7u32, &2_000i128);

    let organizer = Address::generate(env);
    let now = env.ledger().timestamp();
    let event_id = client.create_event(
        &organizer,
        &String::from_str(env, "FX Event"),
        &String::from_str(env, "Desc"),
        &String::from_str(env, "Venue"),
        &(now + 10_000),
        &(now + 20_000),
        &100i128,
        &50u32,
    );
    client.update_event_status(&event_id, &EventStatus::Published, &organizer);
    (client, admin, organizer, event_id)
}

#[test]
fn live_rate_follows_oracle_price_ratio() {
    let env = Env::default();
    let (client, _admin, _organizer, _event_id) = priced_event(&env);

    let usd_to_eur = client.fetch_live_exchange_rate(&usd(&env), &eur(&env));
    assert_eq!(usd_to_eur.rate, RATE_SCALE / 2);

    let eur_to_usd = client.fetch_live_exchange_rate(&eur(&env), &usd(&env));
    assert_eq!(eur_to_usd.rate, RATE_SCALE * 2);
}

#[test]
fn live_rate_for_same_currency_is_one() {
    let env = Env::default();
    let (client, _admin, _organizer, _event_id) = priced_event(&env);

    let rate = client.fetch_live_exchange_rate(&usd(&env), &usd(&env));
    assert_eq!(rate.rate, RATE_SCALE);
}

#[test]
fn live_rate_rejects_unregistered_currency() {
    let env = Env::default();
    let (client, _admin, _organizer, _event_id) = priced_event(&env);

    let result = client.try_fetch_live_exchange_rate(&usd(&env), &String::from_str(&env, "JPY"));
    assert_eq!(result, Err(Ok(LumentixError::UnsupportedCurrency)));
}

#[test]
fn live_rate_rejects_stale_feed() {
    let env = Env::default();
    let (client, admin, _organizer, _event_id) = priced_event(&env);

    env.ledger().with_mut(|li| li.timestamp += MAX_RATE_AGE + 1);
    let result = client.try_fetch_live_exchange_rate(&usd(&env), &eur(&env));
    assert_eq!(result, Err(Ok(LumentixError::StaleExchangeRate)));

    // Refreshing both feeds makes the pair quotable again.
    client.set_currency_oracle(&admin, &usd(&env), &7u32, &1_000i128);
    client.set_currency_oracle(&admin, &eur(&env), &7u32, &2_000i128);
    assert!(client.try_fetch_live_exchange_rate(&usd(&env), &eur(&env)).is_ok());
}

#[test]
fn checkout_converts_ticket_price_into_buyer_currency() {
    let env = Env::default();
    let (client, _admin, _organizer, event_id) = priced_event(&env);
    let buyer = Address::generate(&env);

    let conversion = client.convert_checkout_currency(&buyer, &event_id, &eur(&env), &None);
    assert_eq!(conversion.settlement_amount, 100);
    assert_eq!(conversion.buyer_amount, 50);
    assert_eq!(conversion.settlement_currency, usd(&env));
    assert_eq!(conversion.buyer_currency, eur(&env));
    assert_eq!(conversion.lock_id, 0);
}

#[test]
fn checkout_in_event_currency_is_unchanged() {
    let env = Env::default();
    let (client, _admin, _organizer, event_id) = priced_event(&env);
    let buyer = Address::generate(&env);

    let conversion = client.convert_checkout_currency(&buyer, &event_id, &usd(&env), &None);
    assert_eq!(conversion.buyer_amount, 100);
    assert_eq!(conversion.settlement_amount, 100);
}

#[test]
fn checkout_rounds_buyer_amount_up() {
    let env = Env::default();
    let (client, admin, _organizer, event_id) = priced_event(&env);
    let buyer = Address::generate(&env);

    // 100 USD at 1000/3000 is 33.33.. units; the buyer is charged 34.
    client.set_currency_oracle(&admin, &eur(&env), &7u32, &3_000i128);
    let conversion = client.convert_checkout_currency(&buyer, &event_id, &eur(&env), &None);
    assert_eq!(conversion.buyer_amount, 34);
}

#[test]
fn lock_holds_rate_while_the_market_moves() {
    let env = Env::default();
    let (client, admin, _organizer, event_id) = priced_event(&env);
    let buyer = Address::generate(&env);

    let lock = client.lock_exchange_rate(&buyer, &event_id, &eur(&env));
    assert_eq!(lock.rate, RATE_SCALE / 2);
    assert_eq!(lock.expires_at, lock.locked_at + RATE_LOCK_DURATION);
    assert!(!lock.consumed);

    // EUR doubles in value after the lock was taken.
    client.set_currency_oracle(&admin, &eur(&env), &7u32, &4_000i128);

    let conversion =
        client.convert_checkout_currency(&buyer, &event_id, &eur(&env), &Some(lock.lock_id));
    assert_eq!(conversion.buyer_amount, 50);
    assert_eq!(conversion.lock_id, lock.lock_id);

    // Without the lock the buyer would have seen the new rate.
    let live = client.convert_checkout_currency(&buyer, &event_id, &eur(&env), &None);
    assert_eq!(live.buyer_amount, 25);
}

#[test]
fn lock_can_only_be_used_once() {
    let env = Env::default();
    let (client, _admin, _organizer, event_id) = priced_event(&env);
    let buyer = Address::generate(&env);

    let lock = client.lock_exchange_rate(&buyer, &event_id, &eur(&env));
    client.convert_checkout_currency(&buyer, &event_id, &eur(&env), &Some(lock.lock_id));

    let result =
        client.try_convert_checkout_currency(&buyer, &event_id, &eur(&env), &Some(lock.lock_id));
    assert_eq!(result, Err(Ok(LumentixError::ExchangeRateLockConsumed)));
    assert!(client.get_exchange_rate_lock(&lock.lock_id).consumed);
}

#[test]
fn lock_expires() {
    let env = Env::default();
    let (client, admin, _organizer, event_id) = priced_event(&env);
    let buyer = Address::generate(&env);

    let lock = client.lock_exchange_rate(&buyer, &event_id, &eur(&env));
    env.ledger().with_mut(|li| li.timestamp += RATE_LOCK_DURATION + 1);

    let result =
        client.try_convert_checkout_currency(&buyer, &event_id, &eur(&env), &Some(lock.lock_id));
    assert_eq!(result, Err(Ok(LumentixError::ExchangeRateLockExpired)));
}

#[test]
fn lock_belongs_to_its_buyer_event_and_currency() {
    let env = Env::default();
    let (client, admin, _organizer, event_id) = priced_event(&env);
    let buyer = Address::generate(&env);
    let other = Address::generate(&env);

    client.set_currency_oracle(&admin, &String::from_str(&env, "GBP"), &7u32, &1_500i128);
    let lock = client.lock_exchange_rate(&buyer, &event_id, &eur(&env));

    let result =
        client.try_convert_checkout_currency(&other, &event_id, &eur(&env), &Some(lock.lock_id));
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));

    let result = client.try_convert_checkout_currency(
        &buyer,
        &event_id,
        &String::from_str(&env, "GBP"),
        &Some(lock.lock_id),
    );
    assert_eq!(result, Err(Ok(LumentixError::ExchangeRateLockNotFound)));

    let result = client.try_convert_checkout_currency(&buyer, &event_id, &eur(&env), &Some(999u64));
    assert_eq!(result, Err(Ok(LumentixError::ExchangeRateLockNotFound)));
}

#[test]
fn lock_for_unknown_event_is_rejected() {
    let env = Env::default();
    let (client, _admin, _organizer, _event_id) = priced_event(&env);
    let buyer = Address::generate(&env);

    let result = client.try_lock_exchange_rate(&buyer, &999u64, &eur(&env));
    assert_eq!(result, Err(Ok(LumentixError::EventNotFound)));
}
