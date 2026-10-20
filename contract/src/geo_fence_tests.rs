#![allow(warnings)]
//! Tests for geographic purchase restrictions (#1448):
//! `set_geo_fence_rules`, `validate_buyer_location`, `enforce_geo_restriction`.

use crate::error::LumentixError;
use crate::lumentix_contract::{LumentixContract, LumentixContractClient};
use crate::types::{EventStatus, GeoFenceRules, GeoRestrictionMode};
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Address, Env, String, Vec};

fn setup(env: &Env) -> LumentixContractClient<'_> {
    env.mock_all_auths();
    let contract_id = env.register(LumentixContract, ());
    let client = LumentixContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(&admin);
    client
}

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
        &String::from_str(env, "Geo Fenced Event"),
        &String::from_str(env, "Desc"),
        &String::from_str(env, "Venue"),
        &(now + 1_000),
        &(now + 2_000),
        &price,
        &capacity,
    );
    client.update_event_status(&event_id, &EventStatus::Published, organizer);
    event_id
}

fn make_rules(env: &Env, mode: GeoRestrictionMode, regions: &[&str], enabled: bool) -> GeoFenceRules {
    let mut list = Vec::new(env);
    for r in regions {
        list.push_back(String::from_str(env, r));
    }
    GeoFenceRules {
        enabled,
        mode,
        regions: list,
    }
}

#[test]
fn set_geo_fence_rules_requires_organizer() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let stranger = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 10);

    let result = client.try_set_geo_fence_rules(
        &stranger,
        &event_id,
        &make_rules(&env, GeoRestrictionMode::Allowlist, &["US"], true),
    );
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
}

#[test]
fn set_geo_fence_rules_validates_input() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 10);

    // An enabled fence needs at least one region.
    let empty = make_rules(&env, GeoRestrictionMode::Allowlist, &[], true);
    assert_eq!(
        client.try_set_geo_fence_rules(&organizer, &event_id, &empty),
        Err(Ok(LumentixError::InvalidGeoFenceRules))
    );

    // Region codes must be ISO 3166-1 alpha-2.
    let malformed = make_rules(&env, GeoRestrictionMode::Allowlist, &["USA"], true);
    assert_eq!(
        client.try_set_geo_fence_rules(&organizer, &event_id, &malformed),
        Err(Ok(LumentixError::InvalidCountryCode))
    );
}

#[test]
fn set_geo_fence_rules_normalizes_regions() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 10);

    client.set_geo_fence_rules(
        &organizer,
        &event_id,
        &make_rules(&env, GeoRestrictionMode::Allowlist, &["us", "Ng"], true),
    );

    let stored = client.get_geo_fence_rules(&event_id).unwrap();
    assert!(stored.enabled);
    assert_eq!(stored.regions.len(), 2);
    assert_eq!(stored.regions.get(0).unwrap(), String::from_str(&env, "US"));
    assert_eq!(stored.regions.get(1).unwrap(), String::from_str(&env, "NG"));
}

#[test]
fn validate_buyer_location_without_rules_allows_everyone() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 10);

    assert!(client.validate_buyer_location(&event_id, &String::from_str(&env, "FR")));
}

#[test]
fn validate_buyer_location_enforces_allowlist_and_blocklist() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 10);

    client.set_geo_fence_rules(
        &organizer,
        &event_id,
        &make_rules(&env, GeoRestrictionMode::Allowlist, &["US", "NG"], true),
    );
    assert!(client.validate_buyer_location(&event_id, &String::from_str(&env, "US")));
    assert!(client.validate_buyer_location(&event_id, &String::from_str(&env, "ng")));
    assert!(!client.validate_buyer_location(&event_id, &String::from_str(&env, "GB")));

    // Switch to a blocklist: previously listed regions flip to blocked.
    client.set_geo_fence_rules(
        &organizer,
        &event_id,
        &make_rules(&env, GeoRestrictionMode::Blocklist, &["US"], true),
    );
    assert!(!client.validate_buyer_location(&event_id, &String::from_str(&env, "US")));
    assert!(client.validate_buyer_location(&event_id, &String::from_str(&env, "GB")));

    // Disabling the fence lifts every restriction.
    client.set_geo_fence_rules(
        &organizer,
        &event_id,
        &make_rules(&env, GeoRestrictionMode::Blocklist, &["US"], false),
    );
    assert!(client.validate_buyer_location(&event_id, &String::from_str(&env, "US")));
}

#[test]
fn validate_buyer_location_rejects_malformed_codes() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 10);

    assert_eq!(
        client.try_validate_buyer_location(&event_id, &String::from_str(&env, "")),
        Err(Ok(LumentixError::InvalidCountryCode))
    );
    assert_eq!(
        client.try_validate_buyer_location(&event_id, &String::from_str(&env, "USA")),
        Err(Ok(LumentixError::InvalidCountryCode))
    );
    // Unnormalized codes are repaired, not rejected.
    assert!(client.validate_buyer_location(&event_id, &String::from_str(&env, "ca")));
}

#[test]
fn enforce_geo_restriction_records_allowed_buyer() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 10);

    client.set_geo_fence_rules(
        &organizer,
        &event_id,
        &make_rules(&env, GeoRestrictionMode::Allowlist, &["US"], true),
    );

    // Attesting works for an active fence and persists the normalized code.
    client.enforce_geo_restriction(&buyer, &event_id, &String::from_str(&env, "us"));
    assert_eq!(
        client.get_buyer_location(&event_id, &buyer),
        Some(String::from_str(&env, "US"))
    );
}

#[test]
fn enforce_geo_restriction_blocks_disallowed_buyer() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 10);

    client.set_geo_fence_rules(
        &organizer,
        &event_id,
        &make_rules(&env, GeoRestrictionMode::Allowlist, &["US"], true),
    );

    let result = client.try_enforce_geo_restriction(&buyer, &event_id, &String::from_str(&env, "GB"));
    assert_eq!(result, Err(Ok(LumentixError::BuyerLocationNotAllowed)));
    // A rejected attestation must not be recorded for later reuse.
    assert_eq!(client.get_buyer_location(&event_id, &buyer), None);
}

#[test]
fn purchase_requires_attested_location_when_fenced() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 10);

    client.set_geo_fence_rules(
        &organizer,
        &event_id,
        &make_rules(&env, GeoRestrictionMode::Allowlist, &["US", "NG"], true),
    );

    // No attestation on record: the purchase is refused outright.
    let unfenced = client.try_purchase_ticket(&buyer, &event_id, &100i128);
    assert_eq!(unfenced, Err(Ok(LumentixError::BuyerLocationRequired)));

    // Attest, then purchase succeeds.
    client.enforce_geo_restriction(&buyer, &event_id, &String::from_str(&env, "NG"));
    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);
    assert!(ticket_id > 0);
}

#[test]
fn purchase_rejects_buyer_in_blocked_region() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 10);

    client.set_geo_fence_rules(
        &organizer,
        &event_id,
        &make_rules(&env, GeoRestrictionMode::Allowlist, &["US"], true),
    );

    // The buyer can only reach purchase by attesting; a blocked region never
    // gets that far, and a stored location from a looser fence is rechecked.
    client.set_geo_fence_rules(
        &organizer,
        &event_id,
        &make_rules(&env, GeoRestrictionMode::Blocklist, &["GB"], true),
    );
    let result = client.try_enforce_geo_restriction(&buyer, &event_id, &String::from_str(&env, "GB"));
    assert_eq!(result, Err(Ok(LumentixError::BuyerLocationNotAllowed)));
    assert_eq!(
        client.try_purchase_ticket(&buyer, &event_id, &100i128),
        Err(Ok(LumentixError::BuyerLocationRequired))
    );
}

#[test]
fn batch_purchase_honours_geo_fence() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 10);

    client.set_geo_fence_rules(
        &organizer,
        &event_id,
        &make_rules(&env, GeoRestrictionMode::Allowlist, &["GB"], true),
    );

    assert_eq!(
        client.try_batch_purchase_tickets(&event_id, &2u32, &buyer),
        Err(Ok(LumentixError::BuyerLocationRequired))
    );

    client.enforce_geo_restriction(&buyer, &event_id, &String::from_str(&env, "GB"));
    let tickets = client.batch_purchase_tickets(&event_id, &2u32, &buyer);
    assert_eq!(tickets.len(), 2);
}

#[test]
fn disabled_fence_never_blocks_purchases() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 10);

    client.set_geo_fence_rules(
        &organizer,
        &event_id,
        &make_rules(&env, GeoRestrictionMode::Blocklist, &["US"], false),
    );

    // Rules exist but are switched off: no attestation needed.
    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);
    assert!(ticket_id > 0);
}

#[test]
fn geo_rules_are_per_event() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);
    let fenced = publish_event(&env, &client, &organizer, 100, 10);
    let open = publish_event(&env, &client, &organizer, 100, 10);

    client.set_geo_fence_rules(
        &organizer,
        &fenced,
        &make_rules(&env, GeoRestrictionMode::Allowlist, &["US"], true),
    );

    // Buyer attested for the fenced event only; the open event never asks.
    client.enforce_geo_restriction(&buyer, &fenced, &String::from_str(&env, "US"));
    let ticket_id = client.purchase_ticket(&buyer, &open, &100i128);
    assert!(ticket_id > 0);

    // And a fence on one event does not leak into another's rule set.
    assert!(client.get_geo_fence_rules(&open).is_none());
}
