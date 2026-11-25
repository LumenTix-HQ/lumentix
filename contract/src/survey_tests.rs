#![allow(warnings)]
//! Tests for the secure anonymous event feedback survey mechanism (#1508).
//!
//! Surveys prove attendance via a signature check but never reveal the
//! respondent's wallet address:
//!   * `verify_attendance_proof` confirms the caller owned (and checked in
//!     with) a ticket for a completed event using a non-zero attendance
//!     signature.
//!   * `submit_anonymous_survey` stores an [`AnonymousSurveyResponse`] that
//!     holds no `owner` or `ticket_id`. A one-way nullifier derived from
//!     `(event_id, ticket_id)` prevents the same ticket from submitting twice
//!     without ever recording which ticket it was.
//!   * `compile_survey_results` aggregates per-question averages (×100) across
//!     every response, exposing no individual respondent or wallet.

use crate::error::LumentixError;
use crate::lumentix_contract::{LumentixContract, LumentixContractClient};
use crate::types::EventStatus;
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String, Vec};

fn setup(env: &Env) -> LumentixContractClient<'_> {
    env.mock_all_auths();
    let contract_id = env.register(LumentixContract, ());
    let client = LumentixContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(&admin);
    client
}

/// Create and publish an event ending at `now + 2_000` so the ledger can
/// later be advanced past it to mark the event `Completed` (required by
/// `verify_attendance_proof`). Returns `(event_id, organizer)`.
fn publish_event(env: &Env, client: &LumentixContractClient<'_>) -> (u64, Address) {
    let organizer = Address::generate(env);
    let now = env.ledger().timestamp();
    let event_id = client.create_event(
        &organizer,
        &String::from_str(env, "Survey Test Event"),
        &String::from_str(env, "Description"),
        &String::from_str(env, "Location"),
        &(now + 1_000),
        &(now + 2_000),
        &100i128,
        &50u32,
    );
    client.update_event_status(&event_id, &EventStatus::Published, &organizer);
    (event_id, organizer)
}

/// Purchase a ticket for `buyer` and have the organizer validate it at the
/// gate, recording attendance (`ticket.used = true`). The event is still
/// `Published` at this point.
fn buy_and_use_ticket(
    client: &LumentixContractClient<'_>,
    event_id: &u64,
    organizer: &Address,
    buyer: &Address,
) -> u64 {
    let ticket_id = client.purchase_ticket(buyer, event_id, &100i128);
    client.use_ticket(&ticket_id, organizer);
    ticket_id
}

/// Advance the ledger past the event end time and mark the event
/// `Completed`. Must be called exactly once per event, after every ticket
/// has already been purchased and used.
fn complete_event(
    env: &Env,
    client: &LumentixContractClient<'_>,
    event_id: &u64,
    organizer: &Address,
) {
    env.ledger().set_timestamp(env.ledger().timestamp() + 3_000);
    client.update_event_status(event_id, &EventStatus::Completed, organizer);
}

/// A non-zero attendance authorization signature (proves attendance).
fn valid_signature(env: &Env) -> BytesN<64> {
    BytesN::from_array(env, &[1u8; 64])
}

/// An all-zero signature, which is rejected as an invalid attendance proof.
fn zero_signature(env: &Env) -> BytesN<64> {
    BytesN::from_array(env, &[0u8; 64])
}

// ─── verify_attendance_proof ───────────────────────────────────────────────

#[test]
fn verify_attendance_proof_accepts_used_ticket_for_completed_event() {
    let env = Env::default();
    let client = setup(&env);
    let (event_id, organizer) = publish_event(&env, &client);
    let buyer = Address::generate(&env);
    let ticket_id = buy_and_use_ticket(&client, &event_id, &organizer, &buyer);
    complete_event(&env, &client, &event_id, &organizer);

    let result =
        client.try_verify_attendance_proof(&event_id, &ticket_id, &buyer, &valid_signature(&env));
    assert_eq!(result, Ok(true));
}

#[test]
fn verify_attendance_proof_rejects_event_not_completed() {
    let env = Env::default();
    let client = setup(&env);
    let (event_id, organizer) = publish_event(&env, &client);
    let buyer = Address::generate(&env);
    // Ticket is used but the event is still Published (not Completed).
    let ticket_id = buy_and_use_ticket(&client, &event_id, &organizer, &buyer);

    let result =
        client.try_verify_attendance_proof(&event_id, &ticket_id, &buyer, &valid_signature(&env));
    assert_eq!(result, Err(Ok(LumentixError::EventNotCompleted)));
}

#[test]
fn verify_attendance_proof_rejects_unused_ticket() {
    let env = Env::default();
    let client = setup(&env);
    let (event_id, organizer) = publish_event(&env, &client);
    let buyer = Address::generate(&env);
    // Purchase but never validate at the gate -> not used.
    let ticket_id = client.purchase_ticket(&buyer, &event_id, &100i128);
    complete_event(&env, &client, &event_id, &organizer);

    let result =
        client.try_verify_attendance_proof(&event_id, &ticket_id, &buyer, &valid_signature(&env));
    assert_eq!(result, Err(Ok(LumentixError::AttendanceNotVerified)));
}

#[test]
fn verify_attendance_proof_rejects_non_owner() {
    let env = Env::default();
    let client = setup(&env);
    let (event_id, organizer) = publish_event(&env, &client);
    let buyer = Address::generate(&env);
    let impostor = Address::generate(&env);
    let ticket_id = buy_and_use_ticket(&client, &event_id, &organizer, &buyer);
    complete_event(&env, &client, &event_id, &organizer);

    let result = client.try_verify_attendance_proof(
        &event_id,
        &ticket_id,
        &impostor,
        &valid_signature(&env),
    );
    assert_eq!(result, Err(Ok(LumentixError::ReviewerNotTicketOwner)));
}

#[test]
fn verify_attendance_proof_rejects_zero_signature() {
    let env = Env::default();
    let client = setup(&env);
    let (event_id, organizer) = publish_event(&env, &client);
    let buyer = Address::generate(&env);
    let ticket_id = buy_and_use_ticket(&client, &event_id, &organizer, &buyer);
    complete_event(&env, &client, &event_id, &organizer);

    let result =
        client.try_verify_attendance_proof(&event_id, &ticket_id, &buyer, &zero_signature(&env));
    assert_eq!(result, Err(Ok(LumentixError::AttendanceNotVerified)));
}

// ─── submit_anonymous_survey ───────────────────────────────────────────────

fn ratings(env: &Env, values: &[u32]) -> Vec<u32> {
    let mut v: Vec<u32> = Vec::new(env);
    for &value in values {
        v.push_back(value);
    }
    v
}

#[test]
fn submit_anonymous_survey_succeeds_for_attendee() {
    let env = Env::default();
    let client = setup(&env);
    let (event_id, organizer) = publish_event(&env, &client);
    let buyer = Address::generate(&env);
    let ticket_id = buy_and_use_ticket(&client, &event_id, &organizer, &buyer);
    complete_event(&env, &client, &event_id, &organizer);

    let survey_id = client.submit_anonymous_survey(
        &event_id,
        &ticket_id,
        &buyer,
        &valid_signature(&env),
        &ratings(&env, &[4, 5]),
        &String::from_str(&env, "Loved it"),
    );

    // First survey response is id 1 (counter starts at 1).
    assert_eq!(survey_id, 1u64);
}

#[test]
fn submit_anonymous_survey_rejects_duplicate_from_same_ticket() {
    let env = Env::default();
    let client = setup(&env);
    let (event_id, organizer) = publish_event(&env, &client);
    let buyer = Address::generate(&env);
    let ticket_id = buy_and_use_ticket(&client, &event_id, &organizer, &buyer);
    complete_event(&env, &client, &event_id, &organizer);

    // First submission from this ticket succeeds.
    let first = client.try_submit_anonymous_survey(
        &event_id,
        &ticket_id,
        &buyer,
        &valid_signature(&env),
        &ratings(&env, &[4, 5]),
        &String::from_str(&env, "Loved it"),
    );
    assert_eq!(first, Ok(1u64));

    // A second submission from the SAME ticket is rejected via the nullifier
    // — proving duplicate detection works WITHOUT storing the ticket id or
    // the respondent's wallet address anywhere in the response.
    let second = client.try_submit_anonymous_survey(
        &event_id,
        &ticket_id,
        &buyer,
        &valid_signature(&env),
        &ratings(&env, &[3, 4]),
        &String::from_str(&env, "Second try"),
    );
    assert_eq!(second, Err(Ok(LumentixError::SurveyAlreadySubmitted)));
}

#[test]
fn submit_anonymous_survey_rejects_invalid_rating() {
    let env = Env::default();
    let client = setup(&env);
    let (event_id, organizer) = publish_event(&env, &client);
    let buyer = Address::generate(&env);
    let ticket_id = buy_and_use_ticket(&client, &event_id, &organizer, &buyer);
    complete_event(&env, &client, &event_id, &organizer);

    // Ratings must be between 1 and 5 inclusive.
    let result = client.try_submit_anonymous_survey(
        &event_id,
        &ticket_id,
        &buyer,
        &valid_signature(&env),
        &ratings(&env, &[4, 6]),
        &String::from_str(&env, "Bad rating"),
    );
    assert_eq!(result, Err(Ok(LumentixError::InvalidSurveyRating)));
}

#[test]
fn submit_anonymous_survey_rejects_empty_ratings() {
    let env = Env::default();
    let client = setup(&env);
    let (event_id, organizer) = publish_event(&env, &client);
    let buyer = Address::generate(&env);
    let ticket_id = buy_and_use_ticket(&client, &event_id, &organizer, &buyer);
    complete_event(&env, &client, &event_id, &organizer);

    let empty: Vec<u32> = Vec::new(&env);
    let result = client.try_submit_anonymous_survey(
        &event_id,
        &ticket_id,
        &buyer,
        &valid_signature(&env),
        &empty,
        &String::from_str(&env, "No ratings"),
    );
    assert_eq!(result, Err(Ok(LumentixError::EmptySurveyAnswers)));
}

// ─── compile_survey_results ─────────────────────────────────────────────────

#[test]
fn compile_survey_results_aggregates_averages_across_attendees() {
    let env = Env::default();
    let client = setup(&env);
    let (event_id, organizer) = publish_event(&env, &client);

    // Two distinct attendees submit once each — different tickets, different
    // wallets, yet neither wallet is recorded in the stored responses.
    let buyer_a = Address::generate(&env);
    let buyer_b = Address::generate(&env);
    let ticket_a = buy_and_use_ticket(&client, &event_id, &organizer, &buyer_a);
    let ticket_b = buy_and_use_ticket(&client, &event_id, &organizer, &buyer_b);
    complete_event(&env, &client, &event_id, &organizer);

    let id_a = client.submit_anonymous_survey(
        &event_id,
        &ticket_a,
        &buyer_a,
        &valid_signature(&env),
        &ratings(&env, &[4, 5]),
        &String::from_str(&env, "A"),
    );
    assert_eq!(id_a, 1u64);

    let id_b = client.submit_anonymous_survey(
        &event_id,
        &ticket_b,
        &buyer_b,
        &valid_signature(&env),
        &ratings(&env, &[2, 3]),
        &String::from_str(&env, "B"),
    );
    assert_eq!(id_b, 2u64);

    // Averages ×100: q0 = (4+2)/2 = 3 -> 300, q1 = (5+3)/2 = 4 -> 400.
    let results = client.compile_survey_results(&event_id);
    assert_eq!(results.event_id, event_id);
    assert_eq!(results.total_responses, 2u32);

    let mut expected: Vec<u32> = Vec::new(&env);
    expected.push_back(300u32);
    expected.push_back(400u32);
    assert_eq!(results.average_ratings_x100, expected);
}

#[test]
fn compile_survey_results_fails_with_no_responses() {
    let env = Env::default();
    let client = setup(&env);
    let (event_id, organizer) = publish_event(&env, &client);
    complete_event(&env, &client, &event_id, &organizer);

    let result = client.try_compile_survey_results(&event_id);
    assert_eq!(result, Err(Ok(LumentixError::NoSurveyResponses)));
}
