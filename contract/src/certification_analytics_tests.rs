#![allow(warnings)]
//! Tests for event certification (#654) and predictive analytics (#646).

use crate::error::LumentixError;
use crate::lumentix_contract::{LumentixContract, LumentixContractClient};
use crate::types::{CertificationStandard, EventStatus};
use soroban_sdk::{testutils::Address as _, Address, Env, String, Vec};

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
    price: i128,
    capacity: u32,
) -> u64 {
    let event_id = client.create_event(
        organizer,
        &String::from_str(env, "Cert/Analytics Test Event"),
        &String::from_str(env, "Desc"),
        &String::from_str(env, "Here"),
        &1000u64,
        &2000u64,
        &price,
        &capacity,
    );
    client.update_event_status(&event_id, &EventStatus::Published, organizer);
    event_id
}

// ─── Event Certification (#654) ────────────────────────────────────────────

#[test]
fn issue_certificate_fails_when_standard_not_enabled() {
    let env = Env::default();
    let (_admin, _contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 10);

    let result = client.try_issue_event_certificate(
        &organizer,
        &event_id,
        &CertificationStandard::AuthenticityVerified,
    );
    assert_eq!(result, Err(Ok(LumentixError::CertificationStandardNotFound)));
}

#[test]
fn admin_enables_standard_then_organizer_issues_certificate() {
    let env = Env::default();
    let (admin, _contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 10);

    client.manage_certification_standards(
        &admin,
        &CertificationStandard::AuthenticityVerified,
        &true,
    );

    assert_eq!(client.verify_event_authenticity(&event_id), false);

    let certificate_id = client.issue_event_certificate(
        &organizer,
        &event_id,
        &CertificationStandard::AuthenticityVerified,
    );
    assert_eq!(certificate_id, 1u64);

    assert_eq!(client.verify_event_authenticity(&event_id), true);
}

#[test]
fn issue_certificate_rejects_non_organizer() {
    let env = Env::default();
    let (admin, _contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let stranger = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 10);

    client.manage_certification_standards(
        &admin,
        &CertificationStandard::QualityAssured,
        &true,
    );

    let result = client.try_issue_event_certificate(
        &stranger,
        &event_id,
        &CertificationStandard::QualityAssured,
    );
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
}

#[test]
fn manage_certification_standards_rejects_non_admin() {
    let env = Env::default();
    let (_admin, _contract_id, client) = setup(&env);
    let stranger = Address::generate(&env);

    let result = client.try_manage_certification_standards(
        &stranger,
        &CertificationStandard::SafetyCompliant,
        &true,
    );
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
}

#[test]
fn verify_event_authenticity_false_for_uncertified_event() {
    let env = Env::default();
    let (_admin, _contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 10);

    assert_eq!(client.verify_event_authenticity(&event_id), false);
}

#[test]
fn verify_event_authenticity_errors_for_unknown_event() {
    let env = Env::default();
    let (_admin, _contract_id, client) = setup(&env);

    let result = client.try_verify_event_authenticity(&999u64);
    assert_eq!(result, Err(Ok(LumentixError::EventNotFound)));
}

// ─── Predictive Analytics (#646) ────────────────────────────────────────────

#[test]
fn forecast_ticket_demand_requires_history() {
    let env = Env::default();
    let (_admin, _contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 500);

    let empty: Vec<u32> = Vec::new(&env);
    let result = client.try_forecast_ticket_demand(&event_id, &empty);
    assert_eq!(result, Err(Ok(LumentixError::InsufficientSalesHistory)));
}

#[test]
fn forecast_ticket_demand_weights_recent_periods_more_heavily() {
    let env = Env::default();
    let (_admin, _contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 500);

    // Oldest -> newest: 10, 20, 30. Weighted average with weights 1,2,3:
    // (10*1 + 20*2 + 30*3) / (1+2+3) = (10+40+90)/6 = 140/6 = 23 (integer division).
    let mut sales: Vec<u32> = Vec::new(&env);
    sales.push_back(10u32);
    sales.push_back(20u32);
    sales.push_back(30u32);
    let forecast = client.forecast_ticket_demand(&event_id, &sales);
    assert_eq!(forecast, 23u32);
}

#[test]
fn forecast_ticket_demand_flat_history_returns_same_value() {
    let env = Env::default();
    let (_admin, _contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 500);

    let mut sales: Vec<u32> = Vec::new(&env);
    sales.push_back(15u32);
    sales.push_back(15u32);
    sales.push_back(15u32);
    sales.push_back(15u32);
    let forecast = client.forecast_ticket_demand(&event_id, &sales);
    assert_eq!(forecast, 15u32);
}

#[test]
fn optimize_pricing_strategy_raises_price_under_high_demand() {
    let env = Env::default();
    let (_admin, _contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 500);

    // demand (250) is 2.5x remaining capacity (100) -> >= 20000bps tier -> 130% of base price.
    let price = client.optimize_pricing_strategy(&event_id, &250u32, &100u32);
    assert_eq!(price, 130i128);
}

#[test]
fn optimize_pricing_strategy_discounts_under_low_demand() {
    let env = Env::default();
    let (_admin, _contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 200, 500);

    // demand (10) is far below remaining capacity (1000) -> lowest tier -> 90% of base price.
    let price = client.optimize_pricing_strategy(&event_id, &10u32, &1000u32);
    assert_eq!(price, 180i128);
}

#[test]
fn optimize_pricing_strategy_returns_base_price_when_no_capacity_remaining() {
    let env = Env::default();
    let (_admin, _contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 150, 500);

    let price = client.optimize_pricing_strategy(&event_id, &50u32, &0u32);
    assert_eq!(price, 150i128);
}

#[test]
fn predict_sellout_probability_full_when_already_sold_out() {
    let env = Env::default();
    let (_admin, _contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 500);

    let probability = client.predict_sellout_probability(&event_id, &100u32, &100u32, &5u32, &3u32);
    assert_eq!(probability, 100u32);
}

#[test]
fn predict_sellout_probability_scales_with_pace() {
    let env = Env::default();
    let (_admin, _contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 500);

    // 50 sold over 5 days = 10/day actual. Remaining 50 over 10 days = 5/day required.
    // actual (10) / required (5) = 200% -> capped at 100.
    let probability = client.predict_sellout_probability(&event_id, &50u32, &100u32, &5u32, &10u32);
    assert_eq!(probability, 100u32);

    // 20 sold over 10 days = 2/day actual. Remaining 80 over 20 days = 4/day required.
    // actual (2) / required (4) = 50%.
    let probability2 = client.predict_sellout_probability(&event_id, &20u32, &100u32, &10u32, &20u32);
    assert_eq!(probability2, 50u32);
}

#[test]
fn predict_sellout_probability_zero_when_no_time_remaining_and_not_sold_out() {
    let env = Env::default();
    let (_admin, _contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 500);

    let probability = client.predict_sellout_probability(&event_id, &50u32, &100u32, &5u32, &0u32);
    assert_eq!(probability, 0u32);
}
