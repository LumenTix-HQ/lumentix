#![allow(warnings)]
//! Tests for GDPR data export and right-to-deletion (#1452):
//! `export_user_data`, `request_data_deletion`, `anonymize_historical_records`.

use crate::error::LumentixError;
use crate::gdpr::DeletionStatus;
use crate::lumentix_contract::{LumentixContract, LumentixContractClient};
use crate::types::EventStatus;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

const NOW: u64 = 100;

fn setup(env: &Env) -> LumentixContractClient<'_> {
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = NOW);
    let contract_id = env.register(LumentixContract, ());
    let client = LumentixContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(&admin);
    client
}

fn publish_event(env: &Env, client: &LumentixContractClient, organizer: &Address) -> u64 {
    let event_id = client.create_event(
        organizer,
        &String::from_str(env, "GDPR Event"),
        &String::from_str(env, "Desc"),
        &String::from_str(env, "Venue"),
        &(NOW + 1_000),
        &(NOW + 2_000),
        &100i128,
        &50u32,
    );
    client.update_event_status(&event_id, &EventStatus::Published, organizer);
    event_id
}

#[test]
fn export_returns_only_the_users_tickets_page_by_page() {
    let env = Env::default();
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    let t1 = client.purchase_ticket(&alice, &event_id, &100i128);
    client.purchase_ticket(&bob, &event_id, &100i128);
    let t3 = client.purchase_ticket(&alice, &event_id, &100i128);

    let first = client.export_user_data(&alice, &alice, &0u64, &2u32);
    assert_eq!(first.tickets.len(), 1);
    assert_eq!(first.tickets.get(0).unwrap().id, t1);
    assert_eq!(first.next_ticket_id, 3);
    assert!(first.deletion_request.is_none());

    let second = client.export_user_data(&alice, &alice, &first.next_ticket_id, &2u32);
    assert_eq!(second.tickets.len(), 1);
    assert_eq!(second.tickets.get(0).unwrap().id, t3);
    assert_eq!(second.next_ticket_id, 0);
}

#[test]
fn export_is_limited_to_the_user_or_admin() {
    let env = Env::default();
    let client = setup(&env);
    let alice = Address::generate(&env);
    let stranger = Address::generate(&env);

    let result = client.try_export_user_data(&stranger, &alice, &0u64, &10u32);
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));

    let result = client.try_export_user_data(&alice, &alice, &0u64, &0u32);
    assert_eq!(result, Err(Ok(LumentixError::InvalidDataPageSize)));
    let result = client.try_export_user_data(&alice, &alice, &0u64, &101u32);
    assert_eq!(result, Err(Ok(LumentixError::InvalidDataPageSize)));
}

#[test]
fn deletion_can_only_be_requested_once_and_anonymizing_needs_a_request() {
    let env = Env::default();
    let client = setup(&env);
    let alice = Address::generate(&env);

    let result = client.try_anonymize_historical_records(&alice, &alice, &0u64, &10u32);
    assert_eq!(result, Err(Ok(LumentixError::DeletionNotRequested)));

    let request = client.request_data_deletion(&alice);
    assert_eq!(request.status, DeletionStatus::Pending);
    assert_eq!(request.requested_at, NOW);

    let result = client.try_request_data_deletion(&alice);
    assert_eq!(result, Err(Ok(LumentixError::DeletionAlreadyRequested)));
    assert!(client.get_data_deletion_request(&alice).is_some());
}

#[test]
fn spent_tickets_are_anonymized_and_upcoming_ones_retained() {
    let env = Env::default();
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    let used = client.purchase_ticket(&alice, &event_id, &100i128);
    let upcoming = client.purchase_ticket(&alice, &event_id, &100i128);
    let bobs = client.purchase_ticket(&bob, &event_id, &100i128);
    client.use_ticket(&used, &organizer);

    let request = client.request_data_deletion(&alice);
    let result = client.anonymize_historical_records(&alice, &alice, &0u64, &10u32);
    assert_eq!(result.anonymized, 1);
    assert_eq!(result.retained, 1);
    assert_eq!(result.next_ticket_id, 0);
    assert!(!result.completed);

    // The spent ticket no longer points at Alice; the others are untouched.
    assert_eq!(client.get_ticket(&used).owner, client.address);
    assert_eq!(client.get_ticket(&upcoming).owner, alice);
    assert_eq!(client.get_ticket(&bobs).owner, bob);
    assert_eq!(client.get_ticket_pseudonym(&used), Some(request.pseudonym));
    assert_eq!(client.get_ticket_pseudonym(&upcoming), None);

    // Aggregate figures survive anonymization.
    assert_eq!(client.get_event(&event_id).tickets_sold, 3);
    assert_eq!(client.get_anonymized_stats().tickets_anonymized, 1);
    assert_eq!(
        client.get_data_deletion_request(&alice).unwrap().status,
        DeletionStatus::Pending
    );
}

#[test]
fn deletion_completes_once_nothing_is_retained() {
    let env = Env::default();
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer);
    let alice = Address::generate(&env);

    let ticket = client.purchase_ticket(&alice, &event_id, &100i128);
    client.request_data_deletion(&alice);

    let result = client.anonymize_historical_records(&alice, &alice, &0u64, &10u32);
    assert_eq!((result.anonymized, result.retained), (0, 1));
    assert!(!result.completed);

    // The event happens and the ticket is used; a fresh pass finishes the job.
    client.use_ticket(&ticket, &organizer);
    let result = client.anonymize_historical_records(&alice, &alice, &0u64, &10u32);
    assert_eq!((result.anonymized, result.retained), (1, 0));
    assert!(result.completed);

    let request = client.get_data_deletion_request(&alice).unwrap();
    assert_eq!(request.status, DeletionStatus::Completed);
    assert_eq!(client.get_anonymized_stats().deletions_completed, 1);

    // Nothing is left to export.
    let export = client.export_user_data(&alice, &alice, &0u64, &10u32);
    assert_eq!(export.tickets.len(), 0);
}
