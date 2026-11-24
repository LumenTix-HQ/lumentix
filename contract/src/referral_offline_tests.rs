#![allow(warnings)]
//! Tests for the referral incentive program (#1449) and offline ticket
//! validation (#1450).

use crate::error::LumentixError;
use crate::lumentix_contract::{LumentixContract, LumentixContractClient};
use crate::types::{EventStatus, OfflineScanRecord};
use soroban_sdk::{testutils::Address as _, vec, Address, Env, String};

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
        &String::from_str(env, "Referral Event"),
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
fn referral_conversion_rewards_the_referrer_once() {
    let env = Env::default();
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer);
    let referrer = Address::generate(&env);
    let friend = Address::generate(&env);
    let code = String::from_str(&env, "FRIEND5");

    client.generate_referral_link(&referrer, &event_id, &code);

    // 5% off for the friend, 5% reward for the referrer.
    let (discounted, reward) = client.track_referral_conversion(&friend, &event_id, &code);
    assert_eq!((discounted, reward), (95, 5));

    // The same friend cannot be counted twice.
    let result = client.try_track_referral_conversion(&friend, &event_id, &code);
    assert_eq!(result, Err(Ok(LumentixError::ReferralPurchaseAlreadyProcessed)));

    assert_eq!(client.issue_referral_reward(&referrer, &event_id), 5);
    assert_eq!(client.issue_referral_reward(&referrer, &event_id), 0);
}

#[test]
fn referral_rejects_self_referral_and_unknown_codes() {
    let env = Env::default();
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer);
    let referrer = Address::generate(&env);
    let code = String::from_str(&env, "MINE");

    client.generate_referral_link(&referrer, &event_id, &code);

    let result = client.try_track_referral_conversion(&referrer, &event_id, &code);
    assert_eq!(result, Err(Ok(LumentixError::SelfReferralNotAllowed)));

    let other = Address::generate(&env);
    let result =
        client.try_track_referral_conversion(&other, &event_id, &String::from_str(&env, "NOPE"));
    assert_eq!(result, Err(Ok(LumentixError::ReferralLinkNotFound)));
}

#[test]
fn offline_proofs_validate_and_sync_once() {
    let env = Env::default();
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer);
    let holder = Address::generate(&env);
    let ticket_id = client.purchase_ticket(&holder, &event_id, &100i128);

    let cached = client.cache_validation_proofs(
        &organizer,
        &event_id,
        &vec![&env, ticket_id],
        &3_600u64,
    );
    assert_eq!(cached, 1);

    let proof = client.get_validation_proof(&ticket_id).unwrap();
    assert!(client.validate_ticket_offline(&event_id, &ticket_id, &proof.proof_hash));

    // A tampered hash is refused.
    let wrong = soroban_sdk::BytesN::from_array(&env, &[7u8; 32]);
    let result = client.try_validate_ticket_offline(&event_id, &ticket_id, &wrong);
    assert_eq!(result, Err(Ok(LumentixError::ValidationProofMismatch)));

    // Sync the scan captured at the gate.
    let scan = OfflineScanRecord {
        ticket_id,
        proof_hash: proof.proof_hash.clone(),
        scanned_at: NOW + 10,
        scanner_id: String::from_str(&env, "gate-1"),
    };
    let results =
        client.sync_offline_scans(&organizer, &event_id, &vec![&env, scan.clone()]);
    assert!(results.get(0).unwrap().accepted);
    assert!(client.get_ticket(&ticket_id).used);

    // Re-sending the batch admits no one twice.
    let results = client.sync_offline_scans(&organizer, &event_id, &vec![&env, scan]);
    let second = results.get(0).unwrap();
    assert!(!second.accepted);
    assert_eq!(
        second.reason_code,
        LumentixError::OfflineScanAlreadySynced as u32
    );

    let result = client.try_validate_ticket_offline(&event_id, &ticket_id, &proof.proof_hash);
    assert_eq!(result, Err(Ok(LumentixError::TicketAlreadyUsed)));
}

#[test]
fn offline_proofs_expire() {
    let env = Env::default();
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer);
    let holder = Address::generate(&env);
    let ticket_id = client.purchase_ticket(&holder, &event_id, &100i128);

    client.cache_validation_proofs(&organizer, &event_id, &vec![&env, ticket_id], &60u64);
    let proof = client.get_validation_proof(&ticket_id).unwrap();

    env.ledger().with_mut(|li| li.timestamp = NOW + 61);
    let result = client.try_validate_ticket_offline(&event_id, &ticket_id, &proof.proof_hash);
    assert_eq!(result, Err(Ok(LumentixError::ValidationProofExpired)));
}
