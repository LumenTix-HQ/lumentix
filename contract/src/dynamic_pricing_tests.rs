#![allow(warnings)]
//! Tests for demand/inventory-aware dynamic pricing (#1451):
//! `calculate_dynamic_price`, `apply_price_adjustment`, `log_pricing_decision`.

use crate::error::LumentixError;
use crate::lumentix_contract::{LumentixContract, LumentixContractClient};
use crate::types::{DynamicPricingCurve, EventStatus};
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Address, Env, String};

fn setup(env: &Env) -> LumentixContractClient<'_> {
    env.mock_all_auths();
    let contract_id = env.register(LumentixContract, ());
    let client = LumentixContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(&admin);
    client
}

/// Event starting five days out (standard tier under the default schedule)
/// with the given base price and capacity.
fn publish_event(
    env: &Env,
    client: &LumentixContractClient,
    organizer: &Address,
    price: i128,
    capacity: u32,
) -> u64 {
    let now = env.ledger().timestamp();
    let event_id = client.create_event(
        organizer,
        &String::from_str(env, "Dynamic Pricing Event"),
        &String::from_str(env, "Desc"),
        &String::from_str(env, "Venue"),
        &(now + 5 * 24 * 60 * 60),
        &(now + 6 * 24 * 60 * 60),
        &price,
        &capacity,
    );
    client.update_event_status(&event_id, &EventStatus::Published, organizer);
    event_id
}

fn default_curve() -> DynamicPricingCurve {
    DynamicPricingCurve {
        demand_step_bps: 1_000,
        demand_step_threshold: 2,
        max_demand_steps: 3,
        scarcity_step_bps: 2_000,
        scarcity_threshold_pct: 50,
        min_price_bps: 5_000,
        max_price_bps: 20_000,
    }
}

#[test]
fn static_price_when_no_schedule_and_no_curve() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 50);

    assert_eq!(client.calculate_dynamic_price(&event_id, &0u32, &0u64), 100);

    // Sales are tracked but must not reprice a static event.
    client.purchase_ticket(&buyer, &event_id, &100i128);
    assert_eq!(client.calculate_dynamic_price(&event_id, &0u32, &0u64), 100);
}

#[test]
fn apply_price_adjustment_requires_organizer() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let stranger = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 50);

    let result = client.try_apply_price_adjustment(&stranger, &event_id, &default_curve());
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
}

#[test]
fn apply_price_adjustment_rejects_invalid_curves() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 50);

    let mut zero_threshold = default_curve();
    zero_threshold.demand_step_threshold = 0;
    assert_eq!(
        client.try_apply_price_adjustment(&organizer, &event_id, &zero_threshold),
        Err(Ok(LumentixError::InvalidPricingCurve))
    );

    let mut zero_floor = default_curve();
    zero_floor.min_price_bps = 0;
    assert_eq!(
        client.try_apply_price_adjustment(&organizer, &event_id, &zero_floor),
        Err(Ok(LumentixError::InvalidPricingCurve))
    );

    let mut inverted_bounds = default_curve();
    inverted_bounds.min_price_bps = 15_000;
    inverted_bounds.max_price_bps = 10_000;
    assert_eq!(
        client.try_apply_price_adjustment(&organizer, &event_id, &inverted_bounds),
        Err(Ok(LumentixError::InvalidPricingCurve))
    );

    let mut bad_scarcity = default_curve();
    bad_scarcity.scarcity_threshold_pct = 101;
    assert_eq!(
        client.try_apply_price_adjustment(&organizer, &event_id, &bad_scarcity),
        Err(Ok(LumentixError::InvalidPricingCurve))
    );
}

#[test]
fn apply_price_adjustment_stores_curve_and_logs_decision() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 5_000);
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 50);

    let price = client.apply_price_adjustment(&organizer, &event_id, &default_curve());
    assert_eq!(price, 100);

    let decision = client.get_pricing_decision(&event_id).unwrap();
    assert_eq!(decision.event_id, event_id);
    assert_eq!(decision.base_price, 100);
    assert_eq!(decision.adjusted_price, 100);
    assert_eq!(decision.demand_velocity_per_hour, 0);
    assert_eq!(decision.remaining_inventory, 50);
    assert_eq!(decision.decided_at, 5_000);
}

#[test]
fn demand_velocity_raises_price_in_real_time() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 50);

    client.apply_price_adjustment(&organizer, &event_id, &default_curve());

    // Explicit demand sample: 20 sales/hour against a threshold of 2 caps at
    // max_demand_steps (3), i.e. +30%.
    let priced = client.calculate_dynamic_price(&event_id, &20u32, &3_600u64);
    assert_eq!(priced, 130);

    // Sales made through purchase_ticket feed the rolling window instead.
    let buyer_a = Address::generate(&env);
    let buyer_b = Address::generate(&env);
    client.purchase_ticket(&buyer_a, &event_id, &100i128);
    client.purchase_ticket(&buyer_b, &event_id, &100i128);

    // Two sales in the window against a threshold of 2 = one demand step (+10%).
    let live = client.calculate_dynamic_price(&event_id, &0u32, &0u64);
    assert_eq!(live, 110);
}

#[test]
fn platform_default_demand_tiers_apply_without_curve() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 50);

    // A time schedule exists but no organizer curve: the hard-coded platform
    // demand tiers still apply when the caller supplies a demand sample.
    let schedule = crate::types::PricingSchedule {
        early_bird_multiplier_bps: 8_000,
        standard_multiplier_bps: 10_000,
        late_multiplier_bps: 10_000,
        last_minute_multiplier_bps: 15_000,
        early_bird_days: 30,
        standard_days: 7,
        last_minute_hours: 24,
    };
    client.set_pricing_schedule(&organizer, &event_id, &schedule);

    assert_eq!(client.calculate_dynamic_price(&event_id, &10u32, &3_600u64), 105);
    assert_eq!(client.calculate_dynamic_price(&event_id, &20u32, &3_600u64), 115);
    assert_eq!(client.calculate_dynamic_price(&event_id, &50u32, &3_600u64), 130);
    assert_eq!(client.calculate_dynamic_price(&event_id, &0u32, &0u64), 100);
}

#[test]
fn thin_inventory_raises_price_under_curve() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 10);

    let mut curve = default_curve();
    // Isolate scarcity: demand would need 1000 sales/hour to register.
    curve.demand_step_threshold = 1_000;
    client.apply_price_adjustment(&organizer, &event_id, &curve);

    // Six sales leave four of ten tickets: 40% remaining is at or below the
    // 50% scarcity threshold, so +1 scarcity step (+20%) prices the rest at 120.
    for _ in 0..6 {
        let buyer = Address::generate(&env);
        client.purchase_ticket(&buyer, &event_id, &200i128);
    }

    let priced = client.calculate_dynamic_price(&event_id, &0u32, &0u64);
    assert_eq!(priced, 120);
}

#[test]
fn curve_bounds_clamp_the_adjusted_price() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 50);

    let mut curve = default_curve();
    curve.max_price_bps = 10_500;
    client.apply_price_adjustment(&organizer, &event_id, &curve);

    // One demand step (two sales against a threshold of two) would be 110,
    // but the cap holds the price at 105.
    for _ in 0..2 {
        let buyer = Address::generate(&env);
        client.purchase_ticket(&buyer, &event_id, &100i128);
    }
    let priced = client.calculate_dynamic_price(&event_id, &0u32, &0u64);
    assert_eq!(priced, 105);
}

#[test]
fn log_pricing_decision_is_organizer_only_and_persists() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 7_000);
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let stranger = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 50);

    let unauthorized = client.try_log_pricing_decision(&stranger, &event_id);
    assert_eq!(unauthorized, Err(Ok(LumentixError::Unauthorized)));

    client.apply_price_adjustment(&organizer, &event_id, &default_curve());
    let buyer = Address::generate(&env);
    client.purchase_ticket(&buyer, &event_id, &100i128);

    env.ledger().with_mut(|li| li.timestamp = 7_500);
    let decision = client.log_pricing_decision(&organizer, &event_id);
    assert_eq!(decision.event_id, event_id);
    assert_eq!(decision.base_price, 100);
    // One sale spread over 500 ledger seconds reads as 7 sales/hour, which is
    // three demand steps of two each: +30%.
    assert_eq!(decision.demand_velocity_per_hour, 7);
    assert_eq!(decision.adjusted_price, 130);
    assert_eq!(decision.remaining_inventory, 49);
    assert_eq!(decision.decided_at, 7_500);

    let stored = client.get_pricing_decision(&event_id).unwrap();
    assert_eq!(stored, decision);
}
