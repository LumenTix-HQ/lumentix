#![allow(warnings)]
#![cfg(test)]

use crate::lumentix_contract::{LumentixContract, LumentixContractClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env, String,
};

fn setup_contract(env: &Env) -> (Address, LumentixContractClient) {
    let contract_id = env.register(LumentixContract, ());
    let client = LumentixContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(&admin);
    (admin, client)
}

#[test]
fn test_activate_circuit_breaker_admin_only() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);
    let reason = String::from_str(&env, "Suspicious high-frequency ticketing anomaly");

    // Admin activates circuit breaker with 2 required multi-sig signers to resume
    let res = client.activate_circuit_breaker(&admin, &reason, &2);
    assert_eq!(res, true);

    let status = client.get_circuit_breaker_status().expect("circuit breaker status must exist");
    assert_eq!(status.is_active, true);
    assert_eq!(status.activated_by, admin);
    assert_eq!(status.required_resume_signatures, 2);
}

#[test]
fn test_activate_circuit_breaker_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();

    let (_admin, client) = setup_contract(&env);
    let stranger = Address::generate(&env);
    let reason = String::from_str(&env, "Malicious pause attempt");

    let res = client.try_activate_circuit_breaker(&stranger, &reason, &2);
    assert!(res.is_err());
}

#[test]
fn test_check_anomaly_threshold_trips_breaker() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    // Below threshold: 5 failed, 20 velocity -> false
    let tripped = client.check_anomaly_threshold(&admin, &5, &20);
    assert_eq!(tripped, false);

    // Above threshold: 15 failed transfers (threshold is 10) -> true
    let tripped2 = client.check_anomaly_threshold(&admin, &15, &20);
    assert_eq!(tripped2, true);

    let status = client.get_circuit_breaker_status().expect("circuit breaker status must exist");
    assert_eq!(status.is_active, true);
    assert!(status.anomaly_count >= 1);
}

#[test]
fn test_multi_sig_resume_operations() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);
    let reason = String::from_str(&env, "Emergency pause test");

    // Activate with 2 required signatures
    client.activate_circuit_breaker(&admin, &reason, &2);
    assert_eq!(client.get_circuit_breaker_status().unwrap().is_active, true);

    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);

    // First signer approves: not yet resumed (needs 2)
    let resumed = client.resume_operations(&signer1);
    assert_eq!(resumed, false);
    assert_eq!(client.get_circuit_breaker_status().unwrap().is_active, true);

    // Duplicate approval from signer1 does not increase distinct count
    let resumed_dup = client.resume_operations(&signer1);
    assert_eq!(resumed_dup, false);
    assert_eq!(client.get_circuit_breaker_status().unwrap().is_active, true);

    // Second distinct signer approves: operations resume!
    let resumed2 = client.resume_operations(&signer2);
    assert_eq!(resumed2, true);
    assert_eq!(client.get_circuit_breaker_status().unwrap().is_active, false);
}
