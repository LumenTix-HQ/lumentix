#![allow(warnings)]
#![cfg(test)]

use crate::lumentix_contract::{LumentixContract, LumentixContractClient};
use crate::types::{CrossChainTransferStatus, IdentityProof, IdentityProvider, UpgradeState};
use soroban_sdk::{
    testutils::{Address as _, Events, Ledger},
    xdr, Address, BytesN, Env, String, Vec,
};

fn setup_contract(env: &Env) -> (Address, LumentixContractClient) {
    let contract_id = env.register(LumentixContract, ());
    let client = LumentixContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(&admin);
    (admin, client)
}

// ═══════════════════════════════════════════════════════════════════════════
// UPGRADE MECHANISM TESTS
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_configure_upgrade_governance() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let member1 = Address::generate(&env);
    let member2 = Address::generate(&env);
    let members = Vec::from_array(&env, [member1, member2]);

    let voting_period: u64 = 604800;
    let approval_pct: u32 = 60;

    client.configure_upgrade_governance(&admin, &voting_period, &approval_pct, &members);

    let config = client.get_upgrade_governance_config();
    assert_eq!(config.governance_members.len(), 2);
    assert_eq!(config.voting_period_seconds, voting_period);
    assert_eq!(config.required_approval_percentage, approval_pct);
}

#[test]
fn test_configure_upgrade_governance_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(LumentixContract, ());
    let client = LumentixContractClient::new(&env, &contract_id);

    let fake_admin = Address::generate(&env);
    let members = Vec::new(&env);

    let result = client.try_configure_upgrade_governance(&fake_admin, &604800u64, &60u32, &members);
    assert!(result.is_err());
}

#[test]
fn test_configure_upgrade_governance_empty_members() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let empty_members = Vec::new(&env);
    let result =
        client.try_configure_upgrade_governance(&admin, &604800u64, &60u32, &empty_members);
    assert!(result.is_err());
}

#[test]
fn test_propose_upgrade() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let member1 = Address::generate(&env);
    let member2 = Address::generate(&env);
    let members = Vec::from_array(&env, [member1.clone(), member2]);

    client.configure_upgrade_governance(&admin, &604800u64, &60u32, &members);

    let proposer = member1;
    let wasm_hash = BytesN::from_array(&env, &[1u8; 32]);
    let description = String::from_str(&env, "Upgrade to v2");

    let proposal_id = client.propose_upgrade(&proposer, &wasm_hash, &description);
    assert_eq!(proposal_id, 1);

    let proposal = client.get_upgrade_proposal(&proposal_id);
    assert_eq!(proposal.state, UpgradeState::Pending);
    assert_eq!(proposal.proposer, proposer);
    assert_eq!(proposal.description, description);
    assert_eq!(proposal.total_voters, 2);
}

#[test]
fn test_propose_upgrade_duplicate_hash_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let member1 = Address::generate(&env);
    let member2 = Address::generate(&env);
    let members = Vec::from_array(&env, [member1.clone(), member2]);

    client.configure_upgrade_governance(&admin, &604800u64, &60u32, &members);

    let wasm_hash = BytesN::from_array(&env, &[2u8; 32]);
    let description = String::from_str(&env, "Upgrade");

    client.propose_upgrade(&member1, &wasm_hash, &description);

    let result = client.try_propose_upgrade(&member1, &wasm_hash, &description);
    assert!(result.is_err());
}

#[test]
fn test_vote_on_upgrade() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let member1 = Address::generate(&env);
    let member2 = Address::generate(&env);
    let members = Vec::from_array(&env, [member1.clone(), member2.clone()]);

    client.configure_upgrade_governance(&admin, &604800u64, &60u32, &members);

    let wasm_hash = BytesN::from_array(&env, &[3u8; 32]);
    let description = String::from_str(&env, "Upgrade");

    let proposal_id = client.propose_upgrade(&member1, &wasm_hash, &description);

    client.vote_on_upgrade(&member2, &proposal_id, &true);

    let vote = client.get_upgrade_vote(&proposal_id, &member2).unwrap();
    assert!(vote.vote_yes);
    assert_eq!(vote.voter, member2);
}

#[test]
fn test_vote_on_upgrade_already_voted_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let member1 = Address::generate(&env);
    let member2 = Address::generate(&env);
    let members = Vec::from_array(&env, [member1.clone(), member2.clone()]);

    client.configure_upgrade_governance(&admin, &604800u64, &60u32, &members);

    let wasm_hash = BytesN::from_array(&env, &[4u8; 32]);
    let description = String::from_str(&env, "Upgrade");

    let proposal_id = client.propose_upgrade(&member1, &wasm_hash, &description);

    client.vote_on_upgrade(&member2, &proposal_id, &true);

    let result = client.try_vote_on_upgrade(&member2, &proposal_id, &false);
    assert!(result.is_err());
}

#[test]
fn test_vote_on_upgrade_non_member_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let member1 = Address::generate(&env);
    let member2 = Address::generate(&env);
    let members = Vec::from_array(&env, [member1.clone(), member2]);

    client.configure_upgrade_governance(&admin, &604800u64, &60u32, &members);

    let wasm_hash = BytesN::from_array(&env, &[5u8; 32]);
    let description = String::from_str(&env, "Upgrade");

    let proposal_id = client.propose_upgrade(&member1, &wasm_hash, &description);

    let non_member = Address::generate(&env);
    let result = client.try_vote_on_upgrade(&non_member, &proposal_id, &true);
    assert!(result.is_err());
}

#[test]
fn test_execute_upgrade_no_votes_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let member1 = Address::generate(&env);
    let member2 = Address::generate(&env);
    let members = Vec::from_array(&env, [member1.clone(), member2]);

    client.configure_upgrade_governance(&admin, &3600u64, &60u32, &members);

    let wasm_hash = BytesN::from_array(&env, &[7u8; 32]);
    let description = String::from_str(&env, "Upgrade");

    let proposal_id = client.propose_upgrade(&member1, &wasm_hash, &description);

    env.ledger().set_timestamp(env.ledger().timestamp() + 7200);

    let result = client.try_execute_upgrade(&member1, &proposal_id);
    assert!(result.is_err());
}

#[test]
fn test_upgrade_proposal_events() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let member1 = Address::generate(&env);
    let member2 = Address::generate(&env);
    let members = Vec::from_array(&env, [member1.clone(), member2]);

    client.configure_upgrade_governance(&admin, &604800u64, &60u32, &members);

    let wasm_hash = BytesN::from_array(&env, &[8u8; 32]);
    let description = String::from_str(&env, "Upgrade");

    client.propose_upgrade(&member1, &wasm_hash, &description);

    let events = env.events().all();
    let mut found = false;
    for event in events.events().iter() {
        if let xdr::ContractEventBody::V0(body) = &event.body {
            if let xdr::ScVal::Symbol(topic) = &body.topics[0] {
                if topic.as_slice() == b"upgprop" {
                    found = true;
                    break;
                }
            }
        }
    }
    assert!(found);
}

#[test]
fn test_vote_and_get_vote_events() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let member1 = Address::generate(&env);
    let member2 = Address::generate(&env);
    let members = Vec::from_array(&env, [member1.clone(), member2.clone()]);

    client.configure_upgrade_governance(&admin, &604800u64, &60u32, &members);

    let wasm_hash = BytesN::from_array(&env, &[9u8; 32]);
    let description = String::from_str(&env, "Upgrade");

    let proposal_id = client.propose_upgrade(&member1, &wasm_hash, &description);
    client.vote_on_upgrade(&member2, &proposal_id, &true);

    let events = env.events().all();
    let mut found = false;
    for event in events.events().iter() {
        if let xdr::ContractEventBody::V0(body) = &event.body {
            if let xdr::ScVal::Symbol(topic) = &body.topics[0] {
                if topic.as_slice() == b"upgvote" {
                    found = true;
                    break;
                }
            }
        }
    }
    assert!(found);
}

// ═══════════════════════════════════════════════════════════════════════════
// CARBON OFFSET TESTS
// ═══════════════════════════════════════════════════════════════════════════

fn create_event(env: &Env, client: &LumentixContractClient) -> u64 {
    let organizer = Address::generate(env);
    let name = String::from_str(env, "Green Event");
    let description = String::from_str(env, "Eco-friendly event");
    let location = String::from_str(env, "Eco Park");
    let start_time = env.ledger().timestamp() + 1000;
    let end_time = env.ledger().timestamp() + 10000;
    let ticket_price: i128 = 100;
    let max_tickets: u32 = 100;

    client.create_event(
        &organizer,
        &name,
        &description,
        &location,
        &start_time,
        &end_time,
        &ticket_price,
        &max_tickets,
    )
}

#[test]
fn test_calculate_carbon_footprint() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);
    let event_id = create_event(&env, &client);

    let footprint = client.calculate_carbon_footprint(&event_id, &5000u64, &1000u64, &20u64);

    assert!(footprint.venue_footprint_kg > 0);
    assert!(footprint.attendance_footprint_kg > 0);
    assert!(footprint.travel_footprint_kg > 0);
    assert_eq!(
        footprint.total_footprint_kg,
        footprint.venue_footprint_kg
            + footprint.attendance_footprint_kg
            + footprint.travel_footprint_kg
    );
}

#[test]
fn test_calculate_carbon_footprint_zero_params_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);
    let event_id = create_event(&env, &client);

    let result = client.try_calculate_carbon_footprint(&event_id, &0u64, &1000u64, &20u64);
    assert!(result.is_err());

    let result = client.try_calculate_carbon_footprint(&event_id, &5000u64, &0u64, &20u64);
    assert!(result.is_err());
}

#[test]
fn test_calculate_carbon_footprint_nonexistent_event_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let result = client.try_calculate_carbon_footprint(&999u64, &5000u64, &1000u64, &20u64);
    assert!(result.is_err());
}

#[test]
fn test_purchase_carbon_offset() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);
    let event_id = create_event(&env, &client);

    let purchaser = Address::generate(&env);
    let project_id = String::from_str(&env, "PROJ-001");

    client.calculate_carbon_footprint(&event_id, &5000u64, &1000u64, &20u64);

    let purchase_id =
        client.purchase_carbon_offset(&purchaser, &event_id, &100000i128, &50000i128, &project_id);
    assert_eq!(purchase_id, 1);

    let purchase = client.get_carbon_offset_purchase(&purchase_id);
    assert_eq!(purchase.purchaser, purchaser);
    assert_eq!(purchase.offset_amount_kg, 100000);
    assert!(purchase.verified);

    let impact = client.track_environmental_impact(&event_id);
    assert_eq!(impact.total_offset_kg, 100000);
    assert_eq!(impact.total_purchases, 1);
}

#[test]
fn test_purchase_carbon_offset_zero_amount_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);
    let event_id = create_event(&env, &client);

    let purchaser = Address::generate(&env);
    let project_id = String::from_str(&env, "PROJ-001");

    let result =
        client.try_purchase_carbon_offset(&purchaser, &event_id, &0i128, &50000i128, &project_id);
    assert!(result.is_err());
}

#[test]
fn test_purchase_carbon_offset_empty_project_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);
    let event_id = create_event(&env, &client);

    let purchaser = Address::generate(&env);
    let empty_project = String::from_str(&env, "");

    let result = client.try_purchase_carbon_offset(
        &purchaser,
        &event_id,
        &100000i128,
        &50000i128,
        &empty_project,
    );
    assert!(result.is_err());
}

#[test]
fn test_track_environmental_impact() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);
    let event_id = create_event(&env, &client);

    let impact = client.track_environmental_impact(&event_id);
    assert_eq!(impact.total_footprint_kg, 0);
    assert_eq!(impact.total_offset_kg, 0);
    assert_eq!(impact.total_purchases, 0);
    assert!(!impact.neutral_status);

    client.calculate_carbon_footprint(&event_id, &5000u64, &1000u64, &20u64);

    let impact_after = client.track_environmental_impact(&event_id);
    assert_eq!(impact_after.total_footprint_kg, 135100);

    let purchaser = Address::generate(&env);
    let project_id = String::from_str(&env, "PROJ-002");
    client.purchase_carbon_offset(&purchaser, &event_id, &200000i128, &100000i128, &project_id);

    let impact_final = client.track_environmental_impact(&event_id);
    assert_eq!(impact_final.total_offset_kg, 200000);
    assert!(impact_final.neutral_status);
    assert_eq!(impact_final.net_impact_kg, 135100 - 200000);
}

#[test]
fn test_carbon_footprint_events() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);
    let event_id = create_event(&env, &client);

    client.calculate_carbon_footprint(&event_id, &5000u64, &1000u64, &20u64);

    let events = env.events().all();
    let mut found = false;
    for event in events.events().iter() {
        if let xdr::ContractEventBody::V0(body) = &event.body {
            if let xdr::ScVal::Symbol(topic) = &body.topics[0] {
                if topic.as_slice() == b"carboncal" {
                    found = true;
                    break;
                }
            }
        }
    }
    assert!(found);
}

#[test]
fn test_multiple_carbon_offset_purchases() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);
    let event_id = create_event(&env, &client);

    let purchaser = Address::generate(&env);
    let project_id = String::from_str(&env, "PROJ-003");

    client.calculate_carbon_footprint(&event_id, &1000u64, &500u64, &10u64);

    client.purchase_carbon_offset(&purchaser, &event_id, &50000i128, &25000i128, &project_id);

    client.purchase_carbon_offset(&purchaser, &event_id, &30000i128, &15000i128, &project_id);

    let impact = client.track_environmental_impact(&event_id);
    assert_eq!(impact.total_purchases, 2);
    assert_eq!(impact.total_offset_kg, 80000);
}

// ═══════════════════════════════════════════════════════════════════════════
// IDENTITY VERIFICATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

#[test]
fn test_issue_identity_credential() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let subject = Address::generate(&env);
    let provider = IdentityProvider::Stellar;
    let provider_id = String::from_str(&env, "GB12345...");
    let level: u32 = 3;
    let expires_at = env.ledger().timestamp() + 365 * 24 * 3600;
    let metadata_hash = BytesN::from_array(&env, &[1u8; 32]);

    let credential_id = client.issue_identity_credential(
        &admin,
        &subject,
        &provider,
        &provider_id,
        &level,
        &expires_at,
        &metadata_hash,
    );

    assert_eq!(credential_id, 1);

    let credential = client.get_identity_credential(&credential_id);
    assert_eq!(credential.subject, subject);
    assert_eq!(credential.provider, IdentityProvider::Stellar);
    assert_eq!(credential.level, 3);
    assert!(!credential.revoked);
}

#[test]
fn test_issue_identity_credential_duplicate_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let subject = Address::generate(&env);
    let provider = IdentityProvider::Stellar;
    let provider_id = String::from_str(&env, "GB12345...");
    let level: u32 = 1;
    let expires_at = env.ledger().timestamp() + 365 * 24 * 3600;
    let metadata_hash = BytesN::from_array(&env, &[2u8; 32]);

    client.issue_identity_credential(
        &admin,
        &subject,
        &provider,
        &provider_id,
        &level,
        &expires_at,
        &metadata_hash,
    );

    let result = client.try_issue_identity_credential(
        &admin,
        &subject,
        &provider,
        &provider_id,
        &level,
        &expires_at,
        &metadata_hash,
    );
    assert!(result.is_err());
}

#[test]
fn test_issue_credential_past_expiry_fails() {
    let env = Env::default();
    env.mock_all_auths();

    // Set a base timestamp so we can have a past expiry
    env.ledger().set_timestamp(1000000);

    let (admin, client) = setup_contract(&env);

    let subject = Address::generate(&env);
    let provider = IdentityProvider::Ethereum;
    let provider_id = String::from_str(&env, "0xabc...");
    let level: u32 = 2;
    let expires_at = env.ledger().timestamp() - 1;
    let metadata_hash = BytesN::from_array(&env, &[3u8; 32]);

    let result = client.try_issue_identity_credential(
        &admin,
        &subject,
        &provider,
        &provider_id,
        &level,
        &expires_at,
        &metadata_hash,
    );
    assert!(result.is_err());
}

#[test]
fn test_verify_blockchain_identity() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let subject = Address::generate(&env);
    let provider = IdentityProvider::Solana;
    let provider_id = String::from_str(&env, "SOL12345...");
    let level: u32 = 3;
    let expires_at = env.ledger().timestamp() + 365 * 24 * 3600;
    let metadata_hash = BytesN::from_array(&env, &[4u8; 32]);

    let credential_id = client.issue_identity_credential(
        &admin,
        &subject,
        &provider,
        &provider_id,
        &level,
        &expires_at,
        &metadata_hash,
    );

    let verified = client.verify_blockchain_identity(&credential_id, &subject);
    assert!(verified);
}

#[test]
fn test_verify_blockchain_identity_revoked() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let subject = Address::generate(&env);
    let provider = IdentityProvider::Polygon;
    let provider_id = String::from_str(&env, "POLY123...");
    let level: u32 = 2;
    let expires_at = env.ledger().timestamp() + 365 * 24 * 3600;
    let metadata_hash = BytesN::from_array(&env, &[5u8; 32]);

    let credential_id = client.issue_identity_credential(
        &admin,
        &subject,
        &provider,
        &provider_id,
        &level,
        &expires_at,
        &metadata_hash,
    );

    client.revoke_identity_credential(&admin, &credential_id);

    let result = client.try_verify_blockchain_identity(&credential_id, &subject);
    assert!(result.is_err());
}

#[test]
fn test_verify_blockchain_identity_expired() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let subject = Address::generate(&env);
    let provider = IdentityProvider::Other(String::from_str(&env, "CustomChain"));
    let provider_id = String::from_str(&env, "CUSTOM123...");
    let level: u32 = 1;
    let expires_at = env.ledger().timestamp() + 100;
    let metadata_hash = BytesN::from_array(&env, &[6u8; 32]);

    let credential_id = client.issue_identity_credential(
        &admin,
        &subject,
        &provider,
        &provider_id,
        &level,
        &expires_at,
        &metadata_hash,
    );

    env.ledger().set_timestamp(env.ledger().timestamp() + 200);

    let result = client.try_verify_blockchain_identity(&credential_id, &subject);
    assert!(result.is_err());
}

#[test]
fn test_validate_credential_authenticity() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let subject = Address::generate(&env);
    let provider = IdentityProvider::Stellar;
    let provider_id = String::from_str(&env, "GBTEST...");
    let level: u32 = 4;
    let expires_at = env.ledger().timestamp() + 365 * 24 * 3600;
    let metadata_hash = BytesN::from_array(&env, &[7u8; 32]);

    let credential_id = client.issue_identity_credential(
        &admin,
        &subject,
        &provider,
        &provider_id,
        &level,
        &expires_at,
        &metadata_hash,
    );

    let now = env.ledger().timestamp();
    let proof = IdentityProof {
        credential_id,
        subject: subject.clone(),
        signature: BytesN::from_array(&env, &[1u8; 64]),
        timestamp: now,
    };

    let valid = client.validate_credential_authenticity(&credential_id, &proof);
    assert!(valid);
}

#[test]
fn test_validate_credential_authenticity_wrong_subject() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let subject = Address::generate(&env);
    let provider = IdentityProvider::Stellar;
    let provider_id = String::from_str(&env, "GBWRONG...");
    let level: u32 = 2;
    let expires_at = env.ledger().timestamp() + 365 * 24 * 3600;
    let metadata_hash = BytesN::from_array(&env, &[8u8; 32]);

    let credential_id = client.issue_identity_credential(
        &admin,
        &subject,
        &provider,
        &provider_id,
        &level,
        &expires_at,
        &metadata_hash,
    );

    let now = env.ledger().timestamp();
    let wrong_subject = Address::generate(&env);
    let proof = IdentityProof {
        credential_id,
        subject: wrong_subject,
        signature: BytesN::from_array(&env, &[1u8; 64]),
        timestamp: now,
    };

    let result = client.try_validate_credential_authenticity(&credential_id, &proof);
    assert!(result.is_err());
}

#[test]
fn test_validate_credential_authenticity_empty_signature() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let subject = Address::generate(&env);
    let provider = IdentityProvider::Stellar;
    let provider_id = String::from_str(&env, "GBEMPTY...");
    let level: u32 = 2;
    let expires_at = env.ledger().timestamp() + 365 * 24 * 3600;
    let metadata_hash = BytesN::from_array(&env, &[9u8; 32]);

    let credential_id = client.issue_identity_credential(
        &admin,
        &subject,
        &provider,
        &provider_id,
        &level,
        &expires_at,
        &metadata_hash,
    );

    let now = env.ledger().timestamp();
    let proof = IdentityProof {
        credential_id,
        subject: subject.clone(),
        signature: BytesN::from_array(&env, &[0u8; 64]),
        timestamp: now,
    };

    let result = client.try_validate_credential_authenticity(&credential_id, &proof);
    assert!(result.is_err());
}

#[test]
fn test_identity_events() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let subject = Address::generate(&env);
    let provider = IdentityProvider::Stellar;
    let provider_id = String::from_str(&env, "GBEVENT...");
    let level: u32 = 3;
    let expires_at = env.ledger().timestamp() + 365 * 24 * 3600;
    let metadata_hash = BytesN::from_array(&env, &[10u8; 32]);

    client.issue_identity_credential(
        &admin,
        &subject,
        &provider,
        &provider_id,
        &level,
        &expires_at,
        &metadata_hash,
    );

    let events = env.events().all();
    let mut found = false;
    for event in events.events().iter() {
        if let xdr::ContractEventBody::V0(body) = &event.body {
            if let xdr::ScVal::Symbol(topic) = &body.topics[0] {
                if topic.as_slice() == b"idcrdiss" {
                    found = true;
                    break;
                }
            }
        }
    }
    assert!(found);
}

#[test]
fn test_credential_by_subject_lookup() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let subject = Address::generate(&env);
    let provider = IdentityProvider::Ethereum;
    let provider_id = String::from_str(&env, "0xLOOKUP...");
    let level: u32 = 3;
    let expires_at = env.ledger().timestamp() + 365 * 24 * 3600;
    let metadata_hash = BytesN::from_array(&env, &[11u8; 32]);

    let credential_id = client.issue_identity_credential(
        &admin,
        &subject,
        &provider,
        &provider_id,
        &level,
        &expires_at,
        &metadata_hash,
    );

    let found_id = client.get_credential_by_subject(&subject, &provider);
    assert_eq!(found_id, Some(credential_id));

    let wrong_provider = IdentityProvider::Solana;
    let not_found = client.get_credential_by_subject(&subject, &wrong_provider);
    assert_eq!(not_found, None);
}

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-CHAIN TICKET PORTABILITY TESTS
// ═══════════════════════════════════════════════════════════════════════════

fn create_ticket(env: &Env, client: &LumentixContractClient) -> (u64, u64, Address) {
    let organizer = Address::generate(env);
    let name = String::from_str(env, "Cross-Chain Event");
    let description = String::from_str(env, "Multi-chain event");
    let location = String::from_str(env, "Metaverse");
    let start_time = env.ledger().timestamp() + 1000;
    let end_time = env.ledger().timestamp() + 10000;
    let ticket_price: i128 = 200;
    let max_tickets: u32 = 100;

    let event_id = client.create_event(
        &organizer,
        &name,
        &description,
        &location,
        &start_time,
        &end_time,
        &ticket_price,
        &max_tickets,
    );

    client.update_event_status(&event_id, &crate::types::EventStatus::Published, &organizer);

    let buyer = Address::generate(env);
    let ticket_id = client.purchase_ticket(&buyer, &event_id, &ticket_price);

    (event_id, ticket_id, buyer)
}

#[test]
fn test_register_supported_chain() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let chain = String::from_str(&env, "Ethereum");
    client.register_supported_chain(&admin, &chain);

    assert!(client.is_chain_supported(&chain));
}

#[test]
fn test_register_supported_chain_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(LumentixContract, ());
    let client = LumentixContractClient::new(&env, &contract_id);

    let chain = String::from_str(&env, "Ethereum");
    let result = client.try_register_supported_chain(&Address::generate(&env), &chain);
    assert!(result.is_err());
}

#[test]
fn test_initiate_cross_chain_transfer() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let chain = String::from_str(&env, "Ethereum");
    client.register_supported_chain(&admin, &chain);

    let (event_id, ticket_id, buyer) = create_ticket(&env, &client);
    let recipient = Address::generate(&env);

    let transfer_id =
        client.initiate_cross_chain_transfer(&buyer, &ticket_id, &event_id, &chain, &recipient);

    assert_eq!(transfer_id, 1);

    let transfer = client.get_cross_chain_transfer(&transfer_id);
    assert_eq!(transfer.ticket_id, ticket_id);
    assert_eq!(transfer.sender, buyer);
    assert_eq!(transfer.recipient, recipient);
    assert_eq!(transfer.status, CrossChainTransferStatus::Initiated);
    assert_eq!(transfer.source_chain, String::from_str(&env, "Stellar"));
    assert_eq!(transfer.target_chain, chain);
}

#[test]
fn test_initiate_cross_chain_transfer_unsupported_chain() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let (event_id, ticket_id, buyer) = create_ticket(&env, &client);
    let recipient = Address::generate(&env);
    let unsupported = String::from_str(&env, "UnsupportedChain");

    let result = client.try_initiate_cross_chain_transfer(
        &buyer,
        &ticket_id,
        &event_id,
        &unsupported,
        &recipient,
    );
    assert!(result.is_err());
}

#[test]
fn test_initiate_cross_chain_transfer_not_owner() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let chain = String::from_str(&env, "Ethereum");
    client.register_supported_chain(&admin, &chain);

    let (event_id, ticket_id, _buyer) = create_ticket(&env, &client);
    let recipient = Address::generate(&env);
    let not_owner = Address::generate(&env);

    let result = client
        .try_initiate_cross_chain_transfer(&not_owner, &ticket_id, &event_id, &chain, &recipient);
    assert!(result.is_err());
}

#[test]
fn test_validate_bridge_transaction() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let chain = String::from_str(&env, "Ethereum");
    client.register_supported_chain(&admin, &chain);

    let (event_id, ticket_id, buyer) = create_ticket(&env, &client);
    let recipient = Address::generate(&env);

    let transfer_id =
        client.initiate_cross_chain_transfer(&buyer, &ticket_id, &event_id, &chain, &recipient);

    let tx_hash = String::from_str(&env, "0xabc123...");
    client.validate_bridge_transaction(&admin, &transfer_id, &tx_hash, &123456u64);

    let transfer = client.get_cross_chain_transfer(&transfer_id);
    assert_eq!(transfer.status, CrossChainTransferStatus::BridgeValidated);
    assert_eq!(transfer.bridge_tx_hash, Some(tx_hash.clone()));

    let bridge_tx = client.get_bridge_transaction(&tx_hash).unwrap();
    assert!(bridge_tx.validated);
    assert_eq!(bridge_tx.block_number, 123456);
}

#[test]
fn test_validate_bridge_transaction_already_completed() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let chain = String::from_str(&env, "Ethereum");
    client.register_supported_chain(&admin, &chain);

    let (event_id, ticket_id, buyer) = create_ticket(&env, &client);
    let recipient = Address::generate(&env);

    let transfer_id =
        client.initiate_cross_chain_transfer(&buyer, &ticket_id, &event_id, &chain, &recipient);

    let tx_hash = String::from_str(&env, "0xabc123...");
    client.validate_bridge_transaction(&admin, &transfer_id, &tx_hash, &123456u64);

    let result = client.try_validate_bridge_transaction(&admin, &transfer_id, &tx_hash, &123457u64);
    assert!(result.is_err());
}

#[test]
fn test_complete_cross_chain_transfer() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let chain = String::from_str(&env, "Ethereum");
    client.register_supported_chain(&admin, &chain);

    let (event_id, ticket_id, buyer) = create_ticket(&env, &client);
    let recipient = Address::generate(&env);

    let transfer_id =
        client.initiate_cross_chain_transfer(&buyer, &ticket_id, &event_id, &chain, &recipient);

    let tx_hash = String::from_str(&env, "0xdef456...");
    client.validate_bridge_transaction(&admin, &transfer_id, &tx_hash, &789012u64);

    client.complete_cross_chain_transfer(&buyer, &transfer_id);

    let transfer = client.get_cross_chain_transfer(&transfer_id);
    assert_eq!(transfer.status, CrossChainTransferStatus::Completed);
    assert!(transfer.completed_at.is_some());

    let ticket = env.as_contract(&client.address, || {
        crate::storage::get_ticket(&env, ticket_id).unwrap()
    });
    assert_eq!(ticket.owner, recipient);
}

#[test]
fn test_complete_cross_chain_transfer_not_validated() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let chain = String::from_str(&env, "Ethereum");
    client.register_supported_chain(&admin, &chain);

    let (event_id, ticket_id, buyer) = create_ticket(&env, &client);
    let recipient = Address::generate(&env);

    let transfer_id =
        client.initiate_cross_chain_transfer(&buyer, &ticket_id, &event_id, &chain, &recipient);

    let result = client.try_complete_cross_chain_transfer(&buyer, &transfer_id);
    assert!(result.is_err());
}

#[test]
fn test_bridge_pause_unpause() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    assert!(!client.is_bridge_paused());

    client.set_bridge_paused(&admin, &true);
    assert!(client.is_bridge_paused());

    client.set_bridge_paused(&admin, &false);
    assert!(!client.is_bridge_paused());
}

#[test]
fn test_initiate_transfer_when_bridge_paused() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let chain = String::from_str(&env, "Ethereum");
    client.register_supported_chain(&admin, &chain);

    let (event_id, ticket_id, buyer) = create_ticket(&env, &client);
    let recipient = Address::generate(&env);

    client.set_bridge_paused(&admin, &true);

    let result =
        client.try_initiate_cross_chain_transfer(&buyer, &ticket_id, &event_id, &chain, &recipient);
    assert!(result.is_err());
}

#[test]
fn test_cross_chain_transfer_init_event() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let chain = String::from_str(&env, "Ethereum");
    client.register_supported_chain(&admin, &chain);

    let (event_id, ticket_id, buyer) = create_ticket(&env, &client);
    let recipient = Address::generate(&env);

    client.initiate_cross_chain_transfer(&buyer, &ticket_id, &event_id, &chain, &recipient);

    let events = env.events().all();
    let mut found = false;
    for event in events.events().iter() {
        if let xdr::ContractEventBody::V0(body) = &event.body {
            if let xdr::ScVal::Symbol(topic) = &body.topics[0] {
                if topic.as_slice() == b"cctinit" {
                    found = true;
                    break;
                }
            }
        }
    }
    assert!(found);
}

#[test]
fn test_cross_chain_transfer_complete_event() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, client) = setup_contract(&env);

    let chain = String::from_str(&env, "Ethereum");
    client.register_supported_chain(&admin, &chain);

    let (event_id, ticket_id, buyer) = create_ticket(&env, &client);
    let recipient = Address::generate(&env);

    let transfer_id =
        client.initiate_cross_chain_transfer(&buyer, &ticket_id, &event_id, &chain, &recipient);

    let tx_hash = String::from_str(&env, "0xfullflow...");
    client.validate_bridge_transaction(&admin, &transfer_id, &tx_hash, &999999u64);
    client.complete_cross_chain_transfer(&buyer, &transfer_id);

    let events = env.events().all();
    let mut found = false;
    for event in events.events().iter() {
        if let xdr::ContractEventBody::V0(body) = &event.body {
            if let xdr::ScVal::Symbol(topic) = &body.topics[0] {
                if topic.as_slice() == b"cctcomp" {
                    found = true;
                    break;
                }
            }
        }
    }
    assert!(found);
}
