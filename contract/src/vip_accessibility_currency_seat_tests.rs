#![allow(warnings)]
#![cfg(test)]

use crate::error::LumentixError;
use crate::lumentix_contract::{LumentixContract, LumentixContractClient};
use crate::types::{
    AccessibilityBooking, AccessibilityInventory, CurrencyConfig, EventStatus, Seat, SeatCategory,
    VenueLayout, VenueSection, VipTier,
};
use soroban_sdk::{
    testutils::Address as _, testutils::Events, testutils::Ledger, Address, Env, String, Vec,
};

fn create_test_contract(env: &Env) -> (Address, LumentixContractClient<'_>) {
    let contract_id = env.register(LumentixContract, ());
    let client = LumentixContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(&admin);
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
    client.update_event_status(&event_id, &EventStatus::Published, organizer);
    event_id
}

// ═════════════════════════════════════════════════════════════════════════════
// VIP TIER TESTS
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn test_create_vip_tier_success() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    let mut benefits = Vec::new(&env);
    benefits.push_back(String::from_str(&env, "Early Entry"));
    benefits.push_back(String::from_str(&env, "Exclusive Lounge"));

    let result = client.try_create_vip_tier(
        &organizer,
        &event_id,
        &String::from_str(&env, "Gold"),
        &500i128,
        &10u32,
        &benefits,
    );
    assert!(result.is_ok());
}

#[test]
fn test_create_vip_tier_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let stranger = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    let benefits = Vec::new(&env);
    let result = client.try_create_vip_tier(
        &stranger,
        &event_id,
        &String::from_str(&env, "Gold"),
        &500i128,
        &10u32,
        &benefits,
    );
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
}

#[test]
fn test_create_vip_tier_duplicate() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    let benefits = Vec::new(&env);
    client.create_vip_tier(
        &organizer,
        &event_id,
        &String::from_str(&env, "Gold"),
        &500i128,
        &10u32,
        &benefits,
    );

    let result = client.try_create_vip_tier(
        &organizer,
        &event_id,
        &String::from_str(&env, "Gold"),
        &500i128,
        &10u32,
        &benefits,
    );
    assert_eq!(result, Err(Ok(LumentixError::VipTierAlreadyExists)));
}

#[test]
fn test_assign_vip_benefits_success() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    let mut benefits = Vec::new(&env);
    benefits.push_back(String::from_str(&env, "Early Entry"));

    client.create_vip_tier(
        &organizer,
        &event_id,
        &String::from_str(&env, "Gold"),
        &500i128,
        &10u32,
        &benefits,
    );

    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);

    let result = client.try_assign_vip_benefits(
        &organizer,
        &event_id,
        &ticket_id,
        &String::from_str(&env, "Gold"),
    );
    assert!(result.is_ok());

    let valid = client.validate_vip_access(&ticket_id, &String::from_str(&env, "Gold"));
    assert!(valid);
}

#[test]
fn test_assign_vip_benefits_tier_full() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    let benefits = Vec::new(&env);
    client.create_vip_tier(
        &organizer,
        &event_id,
        &String::from_str(&env, "Bronze"),
        &200i128,
        &1u32,
        &benefits,
    );

    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);
    client.assign_vip_benefits(
        &organizer,
        &event_id,
        &ticket_id,
        &String::from_str(&env, "Bronze"),
    );

    let ticket_id2 = client.purchase_ticket(&buyer, &event_id, &100i128);
    let result = client.try_assign_vip_benefits(
        &organizer,
        &event_id,
        &ticket_id2,
        &String::from_str(&env, "Bronze"),
    );
    assert_eq!(result, Err(Ok(LumentixError::VipTierFull)));
}

#[test]
fn test_validate_vip_access_no_tier() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);

    let valid = client.validate_vip_access(&ticket_id, &String::from_str(&env, "Gold"));
    assert!(!valid);
}

// ═════════════════════════════════════════════════════════════════════════════
// ACCESSIBILITY TESTS
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn test_setup_accessibility_inventory_success() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    let result =
        client.try_setup_accessibility_inventory(&organizer, &event_id, &5u32, &3u32, &2u32);
    assert!(result.is_ok());
}

#[test]
fn test_setup_accessibility_inventory_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let stranger = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    let result =
        client.try_setup_accessibility_inventory(&stranger, &event_id, &5u32, &3u32, &2u32);
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
}

#[test]
fn test_request_accessibility_booking_success() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    client.setup_accessibility_inventory(&organizer, &event_id, &5u32, &3u32, &2u32);

    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);

    let booking_id = client.request_accessibility_booking(
        &buyer,
        &event_id,
        &ticket_id,
        &String::from_str(&env, "wheelchair"),
    );
    assert!(booking_id > 0);
}

#[test]
fn test_request_accessibility_booking_unavailable() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    client.setup_accessibility_inventory(&organizer, &event_id, &0u32, &0u32, &0u32);

    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);

    let result = client.try_request_accessibility_booking(
        &buyer,
        &event_id,
        &ticket_id,
        &String::from_str(&env, "wheelchair"),
    );
    assert_eq!(result, Err(Ok(LumentixError::AccommodationUnavailable)));
}

#[test]
fn test_manage_accessibility_inventory_success() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    client.setup_accessibility_inventory(&organizer, &event_id, &5u32, &3u32, &2u32);

    let result =
        client.try_manage_accessibility_inventory(&organizer, &event_id, &3u32, &2u32, &1u32);
    assert!(result.is_ok());
}

#[test]
fn test_validate_accessibility_needs_true() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    client.setup_accessibility_inventory(&organizer, &event_id, &5u32, &0u32, &0u32);

    let available =
        client.validate_accessibility_needs(&event_id, &String::from_str(&env, "wheelchair"));
    assert!(available);
}

// ═════════════════════════════════════════════════════════════════════════════
// MULTI-CURRENCY TESTS
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn test_set_currency_oracle_success() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);

    let result =
        client.try_set_currency_oracle(&admin, &String::from_str(&env, "EUR"), &2u32, &90i128);
    assert!(result.is_ok());
}

#[test]
fn test_set_currency_oracle_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);
    let stranger = Address::generate(&env);

    let result =
        client.try_set_currency_oracle(&stranger, &String::from_str(&env, "EUR"), &2u32, &90i128);
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
}

#[test]
fn test_set_event_currency_success() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    client.set_currency_oracle(&admin, &String::from_str(&env, "EUR"), &2u32, &90i128);

    let result =
        client.try_set_event_currency(&organizer, &event_id, &String::from_str(&env, "EUR"));
    assert!(result.is_ok());
}

#[test]
fn test_set_event_currency_unsupported() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    let result =
        client.try_set_event_currency(&organizer, &event_id, &String::from_str(&env, "XYZ"));
    assert_eq!(result, Err(Ok(LumentixError::UnsupportedCurrency)));
}

#[test]
fn test_convert_price_same_currency() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);

    client.set_currency_oracle(&admin, &String::from_str(&env, "USD"), &2u32, &100i128);

    let converted = client.convert_price(
        &String::from_str(&env, "USD"),
        &String::from_str(&env, "USD"),
        &1000i128,
    );
    assert_eq!(converted, 1000);
}

#[test]
fn test_convert_price_different_currencies() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);

    client.set_currency_oracle(&admin, &String::from_str(&env, "USD"), &2u32, &100i128);
    client.set_currency_oracle(&admin, &String::from_str(&env, "EUR"), &2u32, &90i128);

    // 1000 USD = 1000 * 100 / 90 = 1111 EUR
    let converted = client.convert_price(
        &String::from_str(&env, "USD"),
        &String::from_str(&env, "EUR"),
        &1000i128,
    );
    assert_eq!(converted, 1111);
}

#[test]
fn test_handle_currency_fluctuation() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);

    client.set_currency_oracle(&admin, &String::from_str(&env, "USD"), &2u32, &100i128);
    client.set_currency_oracle(&admin, &String::from_str(&env, "EUR"), &2u32, &90i128);

    let converted = client.handle_currency_fluctuation(
        &admin,
        &String::from_str(&env, "USD"),
        &110i128,
        &1000i128,
        &String::from_str(&env, "EUR"),
    );
    // 1000 USD * 110 / 90 = 1222 EUR
    assert_eq!(converted, 1222);
}

// ═════════════════════════════════════════════════════════════════════════════
// SEAT SELECTION / VENUE MAPPING TESTS
// ═════════════════════════════════════════════════════════════════════════════

#[test]
fn test_create_venue_layout_success() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    let mut sections = Vec::new(&env);
    sections.push_back(VenueSection {
        name: String::from_str(&env, "A"),
        category: SeatCategory::Standard,
        rows: 2,
        seats_per_row: 3,
        price_multiplier: 100,
    });

    let result = client.try_create_venue_layout(&organizer, &event_id, &sections);
    assert!(result.is_ok());
}

#[test]
fn test_create_venue_layout_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let stranger = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    let sections = Vec::new(&env);
    let result = client.try_create_venue_layout(&stranger, &event_id, &sections);
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
}

#[test]
fn test_select_seat_success() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    let mut sections = Vec::new(&env);
    sections.push_back(VenueSection {
        name: String::from_str(&env, "A"),
        category: SeatCategory::Standard,
        rows: 2,
        seats_per_row: 3,
        price_multiplier: 100,
    });
    client.create_venue_layout(&organizer, &event_id, &sections);

    let hold_duration: u64 = 3600;
    let seat_id = client.select_seat(
        &buyer,
        &event_id,
        &String::from_str(&env, "A"),
        &1u32,
        &1u32,
        &hold_duration,
    );
    assert_eq!(seat_id, String::from_str(&env, "A-1-1"));

    let available =
        client.validate_seat_availability(&event_id, &String::from_str(&env, "A"), &1u32, &1u32);
    assert!(!available);
}

#[test]
fn test_select_seat_already_held() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1000);

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer1 = Address::generate(&env);
    let buyer2 = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    let mut sections = Vec::new(&env);
    sections.push_back(VenueSection {
        name: String::from_str(&env, "A"),
        category: SeatCategory::Standard,
        rows: 2,
        seats_per_row: 3,
        price_multiplier: 100,
    });
    client.create_venue_layout(&organizer, &event_id, &sections);

    client.select_seat(
        &buyer1,
        &event_id,
        &String::from_str(&env, "A"),
        &1u32,
        &1u32,
        &3600u64,
    );

    // Set time to before hold expires
    env.ledger().set_timestamp(2000);

    let result = client.try_select_seat(
        &buyer2,
        &event_id,
        &String::from_str(&env, "A"),
        &1u32,
        &1u32,
        &3600u64,
    );
    assert_eq!(result, Err(Ok(LumentixError::SeatHeld)));
}

#[test]
fn test_release_seat_hold_by_holder() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1000);

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    let mut sections = Vec::new(&env);
    sections.push_back(VenueSection {
        name: String::from_str(&env, "A"),
        category: SeatCategory::Standard,
        rows: 2,
        seats_per_row: 3,
        price_multiplier: 100,
    });
    client.create_venue_layout(&organizer, &event_id, &sections);

    client.select_seat(
        &buyer,
        &event_id,
        &String::from_str(&env, "A"),
        &1u32,
        &1u32,
        &3600u64,
    );

    let result = client.try_release_seat_hold(
        &buyer,
        &event_id,
        &String::from_str(&env, "A"),
        &1u32,
        &1u32,
    );
    assert!(result.is_ok());
}

#[test]
fn test_release_seat_hold_by_organizer() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    let mut sections = Vec::new(&env);
    sections.push_back(VenueSection {
        name: String::from_str(&env, "A"),
        category: SeatCategory::Standard,
        rows: 2,
        seats_per_row: 3,
        price_multiplier: 100,
    });
    client.create_venue_layout(&organizer, &event_id, &sections);

    client.select_seat(
        &buyer,
        &event_id,
        &String::from_str(&env, "A"),
        &1u32,
        &1u32,
        &3600u64,
    );

    let result = client.try_release_seat_hold(
        &organizer,
        &event_id,
        &String::from_str(&env, "A"),
        &1u32,
        &1u32,
    );
    assert!(result.is_ok());
}

#[test]
fn test_validate_seat_availability_free() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    let mut sections = Vec::new(&env);
    sections.push_back(VenueSection {
        name: String::from_str(&env, "A"),
        category: SeatCategory::Standard,
        rows: 2,
        seats_per_row: 3,
        price_multiplier: 100,
    });
    client.create_venue_layout(&organizer, &event_id, &sections);

    let available =
        client.validate_seat_availability(&event_id, &String::from_str(&env, "A"), &1u32, &2u32);
    assert!(available);
}

#[test]
fn test_get_venue_layout() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    let mut sections = Vec::new(&env);
    sections.push_back(VenueSection {
        name: String::from_str(&env, "A"),
        category: SeatCategory::Standard,
        rows: 2,
        seats_per_row: 3,
        price_multiplier: 100,
    });
    client.create_venue_layout(&organizer, &event_id, &sections);

    let layout = client.get_venue_layout(&event_id);
    assert_eq!(layout.sections.len(), 1);
    assert_eq!(
        layout.sections.get(0).unwrap().name,
        String::from_str(&env, "A")
    );
}

#[test]
fn test_get_seat_info() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    let mut sections = Vec::new(&env);
    sections.push_back(VenueSection {
        name: String::from_str(&env, "A"),
        category: SeatCategory::Standard,
        rows: 2,
        seats_per_row: 3,
        price_multiplier: 100,
    });
    client.create_venue_layout(&organizer, &event_id, &sections);

    let seat = client.get_seat_info(&event_id, &String::from_str(&env, "A"), &1u32, &1u32);
    assert!(!seat.occupied);
}

#[test]
fn test_get_vip_tier() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    let mut benefits = Vec::new(&env);
    benefits.push_back(String::from_str(&env, "Early Entry"));

    client.create_vip_tier(
        &organizer,
        &event_id,
        &String::from_str(&env, "Gold"),
        &500i128,
        &10u32,
        &benefits,
    );

    let tier = client.get_vip_tier(&event_id, &String::from_str(&env, "Gold"));
    assert_eq!(tier.price, 500);
    assert_eq!(tier.max_slots, 10);
}

#[test]
fn test_get_event_currency() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    client.set_currency_oracle(&admin, &String::from_str(&env, "EUR"), &2u32, &90i128);
    client.set_event_currency(&organizer, &event_id, &String::from_str(&env, "EUR"));

    let currency = client.get_event_currency(&event_id);
    assert_eq!(currency, String::from_str(&env, "EUR"));
}

#[test]
fn test_get_currency_config() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = create_test_contract(&env);

    client.set_currency_oracle(&admin, &String::from_str(&env, "EUR"), &2u32, &90i128);

    let config = client.get_currency_config(&String::from_str(&env, "EUR"));
    assert_eq!(config.code, String::from_str(&env, "EUR"));
    assert_eq!(config.oracle_price, 90);
}

#[test]
fn test_get_accessibility_booking() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    client.setup_accessibility_inventory(&organizer, &event_id, &5u32, &3u32, &2u32);
    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);

    let booking_id = client.request_accessibility_booking(
        &buyer,
        &event_id,
        &ticket_id,
        &String::from_str(&env, "wheelchair"),
    );

    let booking = client.get_accessibility_booking(&booking_id);
    assert_eq!(booking.event_id, event_id);
    assert!(booking.approved);
}

#[test]
fn test_accessibility_inventory_hearing_visual() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    client.setup_accessibility_inventory(&organizer, &event_id, &0u32, &3u32, &2u32);
    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);

    let booking_id = client.request_accessibility_booking(
        &buyer,
        &event_id,
        &ticket_id,
        &String::from_str(&env, "hearing"),
    );
    assert!(booking_id > 0);

    let ticket_id2 = client.purchase_ticket(&buyer, &event_id, &100i128);
    let booking_id2 = client.request_accessibility_booking(
        &buyer,
        &event_id,
        &ticket_id2,
        &String::from_str(&env, "visual"),
    );
    assert!(booking_id2 > 0);
}

#[test]
fn test_vip_tier_emits_events() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = create_test_contract(&env);
    let organizer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    let benefits = Vec::new(&env);
    client.create_vip_tier(
        &organizer,
        &event_id,
        &String::from_str(&env, "Platinum"),
        &1000i128,
        &5u32,
        &benefits,
    );

    let events = env.events().all();
    let mut found = false;
    for xdr_event in events.events().iter() {
        if let soroban_sdk::xdr::ContractEventBody::V0(body) = &xdr_event.body {
            if let soroban_sdk::xdr::ScVal::Symbol(topic_sym) = &body.topics[0] {
                if topic_sym.as_slice() == b"vipcreate" {
                    found = true;
                    break;
                }
            }
        }
    }
    assert!(
        found,
        "Expected VipTierCreated event with symbol 'vipcreate'"
    );
}
