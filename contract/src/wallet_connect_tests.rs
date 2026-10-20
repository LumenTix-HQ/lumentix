#![allow(warnings)]
//! Tests for WalletConnect session management (#1446).

use crate::error::LumentixError;
use crate::lumentix_contract::{LumentixContract, LumentixContractClient};
use crate::types::WalletSessionStatus;
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Address, Env, String};

const MIN_TTL: u64 = 5 * 60;
const MAX_TTL: u64 = 30 * 24 * 60 * 60;

fn setup(env: &Env) -> LumentixContractClient<'_> {
    env.mock_all_auths();
    let contract_id = env.register(LumentixContract, ());
    let client = LumentixContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(&admin);
    client
}

fn initiate(
    env: &Env,
    client: &LumentixContractClient,
    wallet: &Address,
    ttl: u64,
) -> u64 {
    client.initiate_wallet_connect(
        wallet,
        &String::from_str(env, "Ledger Live"),
        &String::from_str(env, "topic-abc"),
        &ttl,
    )
}

#[test]
fn initiate_creates_pending_session() {
    let env = Env::default();
    let client = setup(&env);
    let wallet = Address::generate(&env);

    env.ledger().with_mut(|li| li.timestamp = 1_000);
    let session_id = initiate(&env, &client, &wallet, 3_600);

    let session = client.get_wallet_session(&session_id);
    assert_eq!(session.session_id, session_id);
    assert_eq!(session.wallet, wallet);
    assert_eq!(session.dapp_name, String::from_str(&env, "Ledger Live"));
    assert_eq!(session.status, WalletSessionStatus::Pending);
    assert_eq!(session.created_at, 1_000);
    assert_eq!(session.approved_at, 0);
    assert_eq!(session.expires_at, 0);
    assert_eq!(session.ttl_seconds, 3_600);

    // A pending session confers no rights.
    assert!(!client.is_wallet_session_active(&session_id));
}

#[test]
fn initiate_rejects_out_of_range_ttl() {
    let env = Env::default();
    let client = setup(&env);
    let wallet = Address::generate(&env);

    let too_short = client.try_initiate_wallet_connect(
        &wallet,
        &String::from_str(&env, "dapp"),
        &String::from_str(&env, "topic"),
        &(MIN_TTL - 1),
    );
    assert_eq!(too_short, Err(Ok(LumentixError::InvalidSessionTtl)));

    let too_long = client.try_initiate_wallet_connect(
        &wallet,
        &String::from_str(&env, "dapp"),
        &String::from_str(&env, "topic"),
        &(MAX_TTL + 1),
    );
    assert_eq!(too_long, Err(Ok(LumentixError::InvalidSessionTtl)));
}

#[test]
fn initiate_rejects_empty_strings() {
    let env = Env::default();
    let client = setup(&env);
    let wallet = Address::generate(&env);

    let empty_dapp = client.try_initiate_wallet_connect(
        &wallet,
        &String::from_str(&env, ""),
        &String::from_str(&env, "topic"),
        &3_600,
    );
    assert!(empty_dapp.is_err());

    let empty_topic = client.try_initiate_wallet_connect(
        &wallet,
        &String::from_str(&env, "dapp"),
        &String::from_str(&env, ""),
        &3_600,
    );
    assert!(empty_topic.is_err());
}

#[test]
fn approve_activates_session_and_sets_expiry() {
    let env = Env::default();
    let client = setup(&env);
    let wallet = Address::generate(&env);

    env.ledger().with_mut(|li| li.timestamp = 1_000);
    let session_id = initiate(&env, &client, &wallet, 3_600);

    env.ledger().with_mut(|li| li.timestamp = 1_500);
    let expires_at = client.approve_wallet_session(&wallet, &session_id);
    assert_eq!(expires_at, 1_500 + 3_600);

    let session = client.get_wallet_session(&session_id);
    assert_eq!(session.status, WalletSessionStatus::Active);
    assert_eq!(session.approved_at, 1_500);
    assert_eq!(session.expires_at, 1_500 + 3_600);
    assert!(client.is_wallet_session_active(&session_id));

    // Past expiry the session is no longer active even though status is not
    // flipped.
    env.ledger().with_mut(|li| li.timestamp = 1_500 + 3_600);
    assert!(!client.is_wallet_session_active(&session_id));
}

#[test]
fn approve_twice_is_rejected() {
    let env = Env::default();
    let client = setup(&env);
    let wallet = Address::generate(&env);

    let session_id = initiate(&env, &client, &wallet, 3_600);
    client.approve_wallet_session(&wallet, &session_id);

    let again = client.try_approve_wallet_session(&wallet, &session_id);
    assert_eq!(again, Err(Ok(LumentixError::WalletSessionAlreadyApproved)));
}

#[test]
fn approve_by_non_session_wallet_is_unauthorized() {
    let env = Env::default();
    let client = setup(&env);
    let wallet = Address::generate(&env);
    let other = Address::generate(&env);

    let session_id = initiate(&env, &client, &wallet, 3_600);
    let result = client.try_approve_wallet_session(&other, &session_id);
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
}

#[test]
fn approve_stale_proposal_is_expired() {
    let env = Env::default();
    let client = setup(&env);
    let wallet = Address::generate(&env);

    env.ledger().with_mut(|li| li.timestamp = 1_000);
    let session_id = initiate(&env, &client, &wallet, 3_600);

    env.ledger().with_mut(|li| li.timestamp = 1_000 + 3_600 + 1);
    let result = client.try_approve_wallet_session(&wallet, &session_id);
    assert_eq!(result, Err(Ok(LumentixError::WalletSessionExpired)));
}

#[test]
fn disconnect_from_pending_and_active() {
    let env = Env::default();
    let client = setup(&env);
    let wallet = Address::generate(&env);

    // Declining a never-approved proposal.
    let pending_id = initiate(&env, &client, &wallet, 3_600);
    client.disconnect_wallet(&wallet, &pending_id);
    let session = client.get_wallet_session(&pending_id);
    assert_eq!(session.status, WalletSessionStatus::Disconnected);
    assert!(!client.is_wallet_session_active(&pending_id));

    // Tearing down an active session.
    let active_id = initiate(&env, &client, &wallet, 3_600);
    client.approve_wallet_session(&wallet, &active_id);
    client.disconnect_wallet(&wallet, &active_id);
    assert!(!client.is_wallet_session_active(&active_id));
}

#[test]
fn disconnect_twice_is_rejected() {
    let env = Env::default();
    let client = setup(&env);
    let wallet = Address::generate(&env);

    let session_id = initiate(&env, &client, &wallet, 3_600);
    client.disconnect_wallet(&wallet, &session_id);

    let again = client.try_disconnect_wallet(&wallet, &session_id);
    assert_eq!(again, Err(Ok(LumentixError::WalletSessionDisconnected)));
}

#[test]
fn approve_after_disconnect_is_rejected() {
    let env = Env::default();
    let client = setup(&env);
    let wallet = Address::generate(&env);

    let session_id = initiate(&env, &client, &wallet, 3_600);
    client.disconnect_wallet(&wallet, &session_id);

    let result = client.try_approve_wallet_session(&wallet, &session_id);
    assert_eq!(result, Err(Ok(LumentixError::WalletSessionDisconnected)));
}

#[test]
fn disconnect_by_non_session_wallet_is_unauthorized() {
    let env = Env::default();
    let client = setup(&env);
    let wallet = Address::generate(&env);
    let other = Address::generate(&env);

    let session_id = initiate(&env, &client, &wallet, 3_600);
    let result = client.try_disconnect_wallet(&other, &session_id);
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
}

#[test]
fn unknown_session_is_not_found() {
    let env = Env::default();
    let client = setup(&env);

    let result = client.try_get_wallet_session(&999u64);
    assert_eq!(result, Err(Ok(LumentixError::WalletSessionNotFound)));
    assert!(!client.is_wallet_session_active(&999u64));
}
