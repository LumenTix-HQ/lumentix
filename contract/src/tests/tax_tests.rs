use crate::error::LumentixError;
use crate::lumentix_contract::{LumentixContract, LumentixContractClient};
use crate::types::TaxJurisdiction;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

fn setup() -> (Env, Address, LumentixContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let contract_id = env.register(LumentixContract, ());
    let client = LumentixContractClient::new(&env, &contract_id);
    client.initialize(&admin);

    (env, admin, client)
}

fn setup_with_event() -> (Env, Address, LumentixContractClient<'static>, u64) {
    let (env, admin, client) = setup();
    let organizer = Address::generate(&env);

    let event_id = client
        .create_event(
            &organizer,
            &String::from_str(&env, "Tax Test Event"),
            &String::from_str(&env, "An event to test tax calculation"),
            &String::from_str(&env, "New York, NY"),
            &(env.ledger().timestamp() + 86400),
            &(env.ledger().timestamp() + 172800),
            &10_000i128, // $100.00 in cents
            &100u32,
        )
        .unwrap();

    (env, admin, client, event_id)
}

// ─── register_tax_rule ───────────────────────────────────────────────────────

#[test]
fn test_register_tax_rule_returns_id() {
    let (env, admin, client) = setup();

    let rule_id = client
        .register_tax_rule(
            &admin,
            &String::from_str(&env, "US-CA"),
            &String::from_str(&env, "California"),
            &TaxJurisdiction::UsState,
            &875u32, // 8.75%
        )
        .unwrap();

    assert_eq!(rule_id, 1u64, "First rule should have id = 1");
}

#[test]
fn test_register_tax_rule_second_increments_id() {
    let (env, admin, client) = setup();

    client
        .register_tax_rule(
            &admin,
            &String::from_str(&env, "US-CA"),
            &String::from_str(&env, "California"),
            &TaxJurisdiction::UsState,
            &875u32,
        )
        .unwrap();

    let id2 = client
        .register_tax_rule(
            &admin,
            &String::from_str(&env, "DE"),
            &String::from_str(&env, "Germany"),
            &TaxJurisdiction::Country,
            &1900u32, // 19%
        )
        .unwrap();

    assert_eq!(id2, 2u64, "Second rule should have id = 2");
}

#[test]
fn test_register_tax_rule_unauthorized() {
    let (env, _admin, client) = setup();
    let rogue = Address::generate(&env);

    let result = client.try_register_tax_rule(
        &rogue,
        &String::from_str(&env, "US-TX"),
        &String::from_str(&env, "Texas"),
        &TaxJurisdiction::UsState,
        &625u32,
    );

    assert!(result.is_err());
}

#[test]
fn test_register_tax_rule_rate_exceeds_max() {
    let (env, admin, client) = setup();

    let result = client.try_register_tax_rule(
        &admin,
        &String::from_str(&env, "XX"),
        &String::from_str(&env, "Extreme Tax Land"),
        &TaxJurisdiction::Country,
        &10_001u32, // > 100%
    );

    assert_eq!(
        result,
        Err(Ok(LumentixError::TaxInvalidRate)),
        "Rate > 10000 bps should fail"
    );
}

#[test]
fn test_register_tax_rule_upserts_existing_code() {
    let (env, admin, client) = setup();

    let id1 = client
        .register_tax_rule(
            &admin,
            &String::from_str(&env, "US-CA"),
            &String::from_str(&env, "California"),
            &TaxJurisdiction::UsState,
            &875u32,
        )
        .unwrap();

    // Update the rate for the same jurisdiction
    let id2 = client
        .register_tax_rule(
            &admin,
            &String::from_str(&env, "US-CA"),
            &String::from_str(&env, "California Updated"),
            &TaxJurisdiction::UsState,
            &900u32,
        )
        .unwrap();

    assert_eq!(id1, id2, "Same jurisdiction should reuse the same rule_id");

    let rule = client.get_tax_rule(&String::from_str(&env, "US-CA")).unwrap();
    assert_eq!(rule.rate_bps, 900u32, "Rate should be updated");
}

// ─── calculate_ticket_sales_tax ──────────────────────────────────────────────

#[test]
fn test_calculate_ticket_sales_tax_basic() {
    let (env, admin, client, event_id) = setup_with_event();

    client
        .register_tax_rule(
            &admin,
            &String::from_str(&env, "US-CA"),
            &String::from_str(&env, "California"),
            &TaxJurisdiction::UsState,
            &875u32, // 8.75%
        )
        .unwrap();

    let calc = client
        .calculate_ticket_sales_tax(
            &event_id,
            &10_000i128,
            &String::from_str(&env, "US-CA"),
        )
        .unwrap();

    assert_eq!(calc.base_price, 10_000i128);
    assert_eq!(calc.tax_amount, 875i128); // 10000 * 875 / 10000 = 875
    assert_eq!(calc.total_price, 10_875i128);
    assert_eq!(calc.effective_rate_bps, 875u32);
}

#[test]
fn test_calculate_ticket_sales_tax_zero_rate() {
    let (env, admin, client, event_id) = setup_with_event();

    client
        .register_tax_rule(
            &admin,
            &String::from_str(&env, "US-OR"),
            &String::from_str(&env, "Oregon"),
            &TaxJurisdiction::UsState,
            &0u32, // Oregon has no sales tax
        )
        .unwrap();

    let calc = client
        .calculate_ticket_sales_tax(
            &event_id,
            &5_000i128,
            &String::from_str(&env, "US-OR"),
        )
        .unwrap();

    assert_eq!(calc.tax_amount, 0i128);
    assert_eq!(calc.total_price, 5_000i128);
}

#[test]
fn test_calculate_ticket_sales_tax_unknown_jurisdiction() {
    let (env, _admin, client, event_id) = setup_with_event();

    let result = client.try_calculate_ticket_sales_tax(
        &event_id,
        &10_000i128,
        &String::from_str(&env, "UNKNOWN"),
    );

    assert_eq!(result, Err(Ok(LumentixError::TaxRuleNotFound)));
}

#[test]
fn test_calculate_ticket_sales_tax_negative_price_fails() {
    let (env, admin, client, event_id) = setup_with_event();

    client
        .register_tax_rule(
            &admin,
            &String::from_str(&env, "DE"),
            &String::from_str(&env, "Germany"),
            &TaxJurisdiction::Country,
            &1900u32,
        )
        .unwrap();

    let result = client.try_calculate_ticket_sales_tax(
        &event_id,
        &0i128,
        &String::from_str(&env, "DE"),
    );

    assert_eq!(result, Err(Ok(LumentixError::TaxInvalidBasePrice)));
}

// ─── record_tax_collection ───────────────────────────────────────────────────

#[test]
fn test_record_tax_collection_returns_record_id() {
    let (env, admin, client, event_id) = setup_with_event();

    client
        .register_tax_rule(
            &admin,
            &String::from_str(&env, "GB"),
            &String::from_str(&env, "United Kingdom"),
            &TaxJurisdiction::Country,
            &2000u32, // 20% VAT
        )
        .unwrap();

    // Purchase a ticket first
    let purchaser = Address::generate(&env);
    // Publish the event first
    client
        .update_event_status(
            &Address::generate(&env),
            &event_id,
            &crate::types::EventStatus::Published,
        )
        .ok(); // ignore error — event requires organizer

    let record_id = client
        .record_tax_collection(
            &purchaser,
            &1u64,   // ticket_id
            &event_id,
            &String::from_str(&env, "GB"),
            &String::from_str(&env, "GBP"),
        )
        .unwrap();

    assert_eq!(record_id, 1u64, "First record should have id = 1");
}

#[test]
fn test_record_tax_collection_calculates_correct_amount() {
    let (env, admin, client, event_id) = setup_with_event();

    // event ticket_price = 10_000
    client
        .register_tax_rule(
            &admin,
            &String::from_str(&env, "FR"),
            &String::from_str(&env, "France"),
            &TaxJurisdiction::Country,
            &2000u32, // 20%
        )
        .unwrap();

    let purchaser = Address::generate(&env);

    client
        .record_tax_collection(
            &purchaser,
            &1u64,
            &event_id,
            &String::from_str(&env, "FR"),
            &String::from_str(&env, "EUR"),
        )
        .unwrap();

    let record = client.get_tax_collection_record(&1u64).unwrap();

    assert_eq!(record.tax_amount, 2_000i128); // 10000 * 2000 / 10000 = 2000
    assert_eq!(record.jurisdiction_code, String::from_str(&env, "FR"));
    assert!(!record.remitted);
}

#[test]
fn test_record_tax_collection_unknown_jurisdiction_fails() {
    let (env, _admin, client, event_id) = setup_with_event();
    let purchaser = Address::generate(&env);

    let result = client.try_record_tax_collection(
        &purchaser,
        &1u64,
        &event_id,
        &String::from_str(&env, "NOWHERE"),
        &String::from_str(&env, "USD"),
    );

    assert_eq!(result, Err(Ok(LumentixError::TaxRuleNotFound)));
}

// ─── export_tax_reports ──────────────────────────────────────────────────────

#[test]
fn test_export_tax_reports_basic() {
    let (env, admin, client, event_id) = setup_with_event();

    client
        .register_tax_rule(
            &admin,
            &String::from_str(&env, "AU"),
            &String::from_str(&env, "Australia"),
            &TaxJurisdiction::Country,
            &1000u32, // 10% GST
        )
        .unwrap();

    let purchaser = Address::generate(&env);
    let now = env.ledger().timestamp();

    client
        .record_tax_collection(
            &purchaser,
            &1u64,
            &event_id,
            &String::from_str(&env, "AU"),
            &String::from_str(&env, "AUD"),
        )
        .unwrap();

    let report = client
        .export_tax_reports(
            &admin,
            &String::from_str(&env, "AU"),
            &String::from_str(&env, "AUD"),
            &(now - 1),
            &(now + 1000),
        )
        .unwrap();

    assert_eq!(report.record_count, 1u32);
    assert_eq!(report.total_tax_collected, 1_000i128); // 10000 * 10% = 1000
    assert_eq!(report.jurisdiction_code, String::from_str(&env, "AU"));
}

#[test]
fn test_export_tax_reports_no_records_fails() {
    let (env, admin, client, _event_id) = setup_with_event();

    client
        .register_tax_rule(
            &admin,
            &String::from_str(&env, "JP"),
            &String::from_str(&env, "Japan"),
            &TaxJurisdiction::Country,
            &1000u32,
        )
        .unwrap();

    let now = env.ledger().timestamp();
    let result = client.try_export_tax_reports(
        &admin,
        &String::from_str(&env, "JP"),
        &String::from_str(&env, "JPY"),
        &(now - 1000),
        &(now + 1000),
    );

    assert_eq!(result, Err(Ok(LumentixError::TaxNoRecordsForJurisdiction)));
}

#[test]
fn test_export_tax_reports_invalid_period() {
    let (env, admin, client, _event_id) = setup_with_event();
    let now = env.ledger().timestamp();

    let result = client.try_export_tax_reports(
        &admin,
        &String::from_str(&env, "US-NY"),
        &String::from_str(&env, "USD"),
        &(now + 1000), // start > end
        &(now),
    );

    assert_eq!(result, Err(Ok(LumentixError::TaxInvalidPeriod)));
}

#[test]
fn test_export_tax_reports_unauthorized() {
    let (env, _admin, client, _event_id) = setup_with_event();
    let rogue = Address::generate(&env);
    let now = env.ledger().timestamp();

    let result = client.try_export_tax_reports(
        &rogue,
        &String::from_str(&env, "US-CA"),
        &String::from_str(&env, "USD"),
        &(now - 1000),
        &(now + 1000),
    );

    assert!(result.is_err());
}

#[test]
fn test_get_tax_report_retrieves_stored_report() {
    let (env, admin, client, event_id) = setup_with_event();

    client
        .register_tax_rule(
            &admin,
            &String::from_str(&env, "CA"),
            &String::from_str(&env, "Canada"),
            &TaxJurisdiction::Country,
            &500u32, // 5% GST
        )
        .unwrap();

    let purchaser = Address::generate(&env);
    let now = env.ledger().timestamp();

    client
        .record_tax_collection(
            &purchaser,
            &1u64,
            &event_id,
            &String::from_str(&env, "CA"),
            &String::from_str(&env, "CAD"),
        )
        .unwrap();

    let generated_report = client
        .export_tax_reports(
            &admin,
            &String::from_str(&env, "CA"),
            &String::from_str(&env, "CAD"),
            &(now - 1),
            &(now + 1000),
        )
        .unwrap();

    let fetched = client.get_tax_report(&generated_report.report_id).unwrap();
    assert_eq!(fetched.report_id, generated_report.report_id);
    assert_eq!(fetched.total_tax_collected, 500i128); // 10000 * 5% = 500
}
