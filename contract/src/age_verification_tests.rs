#![allow(warnings)]
//! Tests for age verification on age-restricted events (#1523):
//! `generate_age_proof`, `verify_age_proof_on_chain`, and the
//! `reject_underage_purchase` guard used by `purchase_ticket`.

use crate::error::LumentixError;
use crate::lumentix_contract::{LumentixContract, LumentixContractClient};
use crate::types::EventStatus;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, BytesN, Env, String,
};

const NOW: u64 = 100;
const ONE_DAY: u64 = 86_400;

fn setup(env: &Env) -> (Address, LumentixContractClient<'_>) {
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = NOW);
    let contract_id = env.register(LumentixContract, ());
    let client = LumentixContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(&admin);
    (admin, client)
}

fn publish_event(env: &Env, client: &LumentixContractClient, organizer: &Address) -> u64 {
    let event_id = client.create_event(
        organizer,
        &String::from_str(env, "18+ Concert"),
        &String::from_str(env, "Desc"),
        &String::from_str(env, "Venue"),
        &(NOW + 10 * ONE_DAY),
        &(NOW + 11 * ONE_DAY),
        &100i128,
        &50u32,
    );
    client.update_event_status(&event_id, &EventStatus::Published, organizer);
    event_id
}

fn commitment(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[7u8; 32])
}

#[test]
fn proof_meeting_threshold_verifies() {
    let env = Env::default();
    let (admin, client) = setup(&env);
    let subject = Address::generate(&env);

    client.generate_age_proof(&admin, &subject, &21, &commitment(&env), &ONE_DAY);

    assert!(client.verify_age_proof_on_chain(&subject, &18));
    assert!(client.verify_age_proof_on_chain(&subject, &21));
}

#[test]
fn proof_below_threshold_fails_verification() {
    let env = Env::default();
    let (admin, client) = setup(&env);
    let subject = Address::generate(&env);

    client.generate_age_proof(&admin, &subject, &18, &commitment(&env), &ONE_DAY);

    assert_eq!(
        client.try_verify_age_proof_on_chain(&subject, &21),
        Err(Ok(LumentixError::AgeVerificationFailed))
    );
}

#[test]
fn missing_and_expired_proofs_are_rejected() {
    let env = Env::default();
    let (admin, client) = setup(&env);
    let subject = Address::generate(&env);

    assert_eq!(
        client.try_verify_age_proof_on_chain(&subject, &18),
        Err(Ok(LumentixError::AgeProofNotFound))
    );

    client.generate_age_proof(&admin, &subject, &21, &commitment(&env), &ONE_DAY);
    // Still valid exactly at expiry; rejected one second after.
    env.ledger().with_mut(|li| li.timestamp = NOW + ONE_DAY);
    assert!(client.verify_age_proof_on_chain(&subject, &18));
    env.ledger().with_mut(|li| li.timestamp = NOW + ONE_DAY + 1);
    assert_eq!(
        client.try_verify_age_proof_on_chain(&subject, &18),
        Err(Ok(LumentixError::AgeProofExpired))
    );
}

#[test]
fn only_admin_can_issue_proofs() {
    let env = Env::default();
    let (_admin, client) = setup(&env);
    let impostor = Address::generate(&env);
    let subject = Address::generate(&env);

    assert_eq!(
        client.try_generate_age_proof(&impostor, &subject, &21, &commitment(&env), &ONE_DAY),
        Err(Ok(LumentixError::Unauthorized))
    );
}

#[test]
fn purchase_on_restricted_event_requires_valid_proof() {
    let env = Env::default();
    let (admin, client) = setup(&env);
    let organizer = Address::generate(&env);
    let adult = Address::generate(&env);
    let minor = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer);
    client.set_event_age_restriction(&organizer, &event_id, &18);

    client.generate_age_proof(&admin, &adult, &18, &commitment(&env), &ONE_DAY);
    client.generate_age_proof(&admin, &minor, &16, &commitment(&env), &ONE_DAY);

    client.purchase_ticket(&adult, &event_id, &100i128);
    assert_eq!(
        client.try_purchase_ticket(&minor, &event_id, &100i128),
        Err(Ok(LumentixError::UnderageEventPurchase))
    );
    // No proof at all is treated the same as an underage proof.
    let anonymous = Address::generate(&env);
    assert_eq!(
        client.try_purchase_ticket(&anonymous, &event_id, &100i128),
        Err(Ok(LumentixError::UnderageEventPurchase))
    );
}

#[test]
fn unrestricted_or_cleared_events_need_no_proof() {
    let env = Env::default();
    let (_admin, client) = setup(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer);

    client.purchase_ticket(&buyer, &event_id, &100i128);

    client.set_event_age_restriction(&organizer, &event_id, &18);
    client.set_event_age_restriction(&organizer, &event_id, &0);
    client.purchase_ticket(&Address::generate(&env), &event_id, &100i128);
}

#[test]
fn only_organizer_can_set_age_restriction() {
    let env = Env::default();
    let (_admin, client) = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer);

    assert_eq!(
        client.try_set_event_age_restriction(&Address::generate(&env), &event_id, &18),
        Err(Ok(LumentixError::Unauthorized))
    );
}
