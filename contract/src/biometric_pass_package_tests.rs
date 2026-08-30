#![allow(warnings)]
//! Tests for biometric authentication (#649) and cross-event pass packages (#906).

use crate::error::LumentixError;
use crate::lumentix_contract::{LumentixContract, LumentixContractClient};
use crate::types::{BiometricPrivacyAction, BiometricType, EventStatus};
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String, Vec};

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
        &String::from_str(env, "Biometric/Pass Package Test Event"),
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

// ─── Biometric Authentication (#649) ───────────────────────────────────────

#[test]
fn register_biometric_data_requires_consent() {
    let env = Env::default();
    let (_admin, _contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let user = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 10);

    let credential_id = BytesN::from_array(&env, &[1u8; 32]);
    let public_key = BytesN::from_array(&env, &[2u8; 32]);

    let result = client.try_register_biometric_data(
        &user,
        &event_id,
        &credential_id,
        &public_key,
        &BiometricType::Fingerprint,
    );
    assert_eq!(result, Err(Ok(LumentixError::BiometricConsentRequired)));
}

#[test]
fn grant_consent_then_register_and_authenticate() {
    let env = Env::default();
    let (_admin, _contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let user = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 10);

    client.manage_biometric_privacy(&user, &event_id, &BiometricPrivacyAction::GrantConsent);

    let credential_id = BytesN::from_array(&env, &[1u8; 32]);
    let public_key = BytesN::from_array(&env, &[2u8; 32]);
    client.register_biometric_data(
        &user,
        &event_id,
        &credential_id,
        &public_key,
        &BiometricType::FacialRecognition,
    );

    let authenticated = client.authenticate_biometric(&user, &event_id);
    assert_eq!(authenticated, true);
}

#[test]
fn register_biometric_data_rejects_duplicate_enrollment() {
    let env = Env::default();
    let (_admin, _contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let user = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 10);

    client.manage_biometric_privacy(&user, &event_id, &BiometricPrivacyAction::GrantConsent);
    let credential_id = BytesN::from_array(&env, &[1u8; 32]);
    let public_key = BytesN::from_array(&env, &[2u8; 32]);
    client.register_biometric_data(
        &user,
        &event_id,
        &credential_id,
        &public_key,
        &BiometricType::Fingerprint,
    );

    let result = client.try_register_biometric_data(
        &user,
        &event_id,
        &credential_id,
        &public_key,
        &BiometricType::Fingerprint,
    );
    assert_eq!(
        result,
        Err(Ok(LumentixError::BiometricCredentialAlreadyExists))
    );
}

#[test]
fn authenticate_biometric_fails_without_enrollment() {
    let env = Env::default();
    let (_admin, _contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let user = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 10);

    client.manage_biometric_privacy(&user, &event_id, &BiometricPrivacyAction::GrantConsent);

    let result = client.try_authenticate_biometric(&user, &event_id);
    assert_eq!(result, Err(Ok(LumentixError::BiometricCredentialNotFound)));
}

#[test]
fn disable_credential_blocks_authentication() {
    let env = Env::default();
    let (_admin, _contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let user = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 10);

    client.manage_biometric_privacy(&user, &event_id, &BiometricPrivacyAction::GrantConsent);
    let credential_id = BytesN::from_array(&env, &[1u8; 32]);
    let public_key = BytesN::from_array(&env, &[2u8; 32]);
    client.register_biometric_data(
        &user,
        &event_id,
        &credential_id,
        &public_key,
        &BiometricType::Fingerprint,
    );

    client.manage_biometric_privacy(&user, &event_id, &BiometricPrivacyAction::Disable);

    let result = client.try_authenticate_biometric(&user, &event_id);
    assert_eq!(result, Err(Ok(LumentixError::BiometricCredentialDisabled)));

    client.manage_biometric_privacy(&user, &event_id, &BiometricPrivacyAction::Enable);
    assert_eq!(client.authenticate_biometric(&user, &event_id), true);
}

#[test]
fn delete_credential_permanently_removes_it() {
    let env = Env::default();
    let (_admin, _contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let user = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 10);

    client.manage_biometric_privacy(&user, &event_id, &BiometricPrivacyAction::GrantConsent);
    let credential_id = BytesN::from_array(&env, &[1u8; 32]);
    let public_key = BytesN::from_array(&env, &[2u8; 32]);
    client.register_biometric_data(
        &user,
        &event_id,
        &credential_id,
        &public_key,
        &BiometricType::Fingerprint,
    );

    client.manage_biometric_privacy(&user, &event_id, &BiometricPrivacyAction::Delete);

    let result = client.try_authenticate_biometric(&user, &event_id);
    assert_eq!(result, Err(Ok(LumentixError::BiometricCredentialNotFound)));

    // Re-registration is possible after deletion, since consent is untouched.
    client.register_biometric_data(
        &user,
        &event_id,
        &credential_id,
        &public_key,
        &BiometricType::Fingerprint,
    );
    assert_eq!(client.authenticate_biometric(&user, &event_id), true);
}

#[test]
fn revoke_consent_disables_existing_credential() {
    let env = Env::default();
    let (_admin, _contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let user = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 10);

    client.manage_biometric_privacy(&user, &event_id, &BiometricPrivacyAction::GrantConsent);
    let credential_id = BytesN::from_array(&env, &[1u8; 32]);
    let public_key = BytesN::from_array(&env, &[2u8; 32]);
    client.register_biometric_data(
        &user,
        &event_id,
        &credential_id,
        &public_key,
        &BiometricType::Fingerprint,
    );

    client.manage_biometric_privacy(&user, &event_id, &BiometricPrivacyAction::RevokeConsent);

    let result = client.try_authenticate_biometric(&user, &event_id);
    assert_eq!(result, Err(Ok(LumentixError::BiometricConsentRequired)));
}

#[test]
fn set_event_biometric_requirement_rejects_non_organizer() {
    let env = Env::default();
    let (_admin, _contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let stranger = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 10);

    let result = client.try_set_event_biometric_requirement(&stranger, &event_id, &true);
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));

    client.set_event_biometric_requirement(&organizer, &event_id, &true);
    assert_eq!(client.is_biometric_required(&event_id), true);
}

// ─── Cross-Event Pass Packages (#906) ──────────────────────────────────────

fn events_vec(env: &Env, ids: &[u64]) -> Vec<u64> {
    let mut v = Vec::new(env);
    for id in ids {
        v.push_back(*id);
    }
    v
}

#[test]
fn create_pass_package_rejects_empty_events_or_zero_allowance() {
    let env = Env::default();
    let (_admin, _contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let owner = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 10);

    let empty = events_vec(&env, &[]);
    let result = client.try_create_pass_package(&organizer, &owner, &empty, &3u32, &5000u64);
    assert_eq!(result, Err(Ok(LumentixError::InvalidPassPackageConfig)));

    let ids = events_vec(&env, &[event_id]);
    let result2 = client.try_create_pass_package(&organizer, &owner, &ids, &0u32, &5000u64);
    assert_eq!(result2, Err(Ok(LumentixError::InvalidPassPackageConfig)));
}

#[test]
fn create_pass_package_rejects_events_from_other_organizers() {
    let env = Env::default();
    let (_admin, _contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let other_organizer = Address::generate(&env);
    let owner = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer, 100, 10);
    let foreign_event_id = publish_event(&env, &client, &other_organizer, 100, 10);

    let ids = events_vec(&env, &[event_id, foreign_event_id]);
    let result = client.try_create_pass_package(&organizer, &owner, &ids, &2u32, &5000u64);
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
}

#[test]
fn create_check_and_deduct_pass_allowance_flow() {
    let env = Env::default();
    let (_admin, _contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let owner = Address::generate(&env);
    let event_a = publish_event(&env, &client, &organizer, 100, 10);
    let event_b = publish_event(&env, &client, &organizer, 100, 10);
    let event_c = publish_event(&env, &client, &organizer, 100, 10);

    let ids = events_vec(&env, &[event_a, event_b, event_c]);
    let package_id = client.create_pass_package(&organizer, &owner, &ids, &2u32, &5000u64);
    assert_eq!(package_id, 1u64);

    let (remaining, eligible) = client.check_pass_balance(&package_id);
    assert_eq!(remaining, 2u32);
    assert_eq!(eligible.len(), 3u32);

    let remaining_after_first = client.deduct_pass_allowance(&owner, &package_id, &event_a);
    assert_eq!(remaining_after_first, 1u32);

    let remaining_after_second = client.deduct_pass_allowance(&owner, &package_id, &event_b);
    assert_eq!(remaining_after_second, 0u32);

    // Allowance is exhausted, even though event_c is still eligible.
    let result = client.try_deduct_pass_allowance(&owner, &package_id, &event_c);
    assert_eq!(result, Err(Ok(LumentixError::PassPackageExhausted)));
}

#[test]
fn deduct_pass_allowance_rejects_ineligible_event() {
    let env = Env::default();
    let (_admin, _contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let owner = Address::generate(&env);
    let event_a = publish_event(&env, &client, &organizer, 100, 10);
    let outside_event = publish_event(&env, &client, &organizer, 100, 10);

    let ids = events_vec(&env, &[event_a]);
    let package_id = client.create_pass_package(&organizer, &owner, &ids, &3u32, &5000u64);

    let result = client.try_deduct_pass_allowance(&owner, &package_id, &outside_event);
    assert_eq!(result, Err(Ok(LumentixError::PassPackageEventNotEligible)));
}

#[test]
fn deduct_pass_allowance_rejects_non_owner() {
    let env = Env::default();
    let (_admin, _contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let owner = Address::generate(&env);
    let stranger = Address::generate(&env);
    let event_a = publish_event(&env, &client, &organizer, 100, 10);

    let ids = events_vec(&env, &[event_a]);
    let package_id = client.create_pass_package(&organizer, &owner, &ids, &3u32, &5000u64);

    let result = client.try_deduct_pass_allowance(&stranger, &package_id, &event_a);
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
}

#[test]
fn deduct_pass_allowance_rejects_expired_package() {
    let env = Env::default();
    let (_admin, _contract_id, client) = setup(&env);
    let organizer = Address::generate(&env);
    let owner = Address::generate(&env);
    let event_a = publish_event(&env, &client, &organizer, 100, 10);

    let ids = events_vec(&env, &[event_a]);
    // expires_at (500) is before the default ledger timestamp (0 is start, we
    // advance below), so the very next deduction attempt is already expired.
    let package_id = client.create_pass_package(&organizer, &owner, &ids, &3u32, &500u64);

    env.ledger().with_mut(|l| l.timestamp = 1000);

    let result = client.try_deduct_pass_allowance(&owner, &package_id, &event_a);
    assert_eq!(result, Err(Ok(LumentixError::PassPackageExpired)));
}

#[test]
fn check_pass_balance_errors_for_unknown_package() {
    let env = Env::default();
    let (_admin, _contract_id, client) = setup(&env);

    let result = client.try_check_pass_balance(&999u64);
    assert_eq!(result, Err(Ok(LumentixError::PassPackageNotFound)));
}
