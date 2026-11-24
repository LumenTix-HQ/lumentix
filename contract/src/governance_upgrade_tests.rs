#![allow(warnings)]
//! Tests for the multi-sig governance upgrade API (#1447):
//! `propose_contract_upgrade`, `cast_governance_vote`, `execute_approved_upgrade`.

use crate::error::LumentixError;
use crate::lumentix_contract::{LumentixContract, LumentixContractClient};
use crate::types::UpgradeState;
use soroban_sdk::{
    testutils::Address as _, testutils::Ledger as _, Address, BytesN, Env, String, Vec,
};

fn setup(env: &Env) -> (Address, LumentixContractClient<'_>) {
    env.mock_all_auths();
    let contract_id = env.register(LumentixContract, ());
    let client = LumentixContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(&admin);
    (admin, client)
}

fn with_members(
    env: &Env,
    client: &LumentixContractClient,
    admin: &Address,
) -> (Address, Address, Address) {
    let m1 = Address::generate(env);
    let m2 = Address::generate(env);
    let m3 = Address::generate(env);
    let members = Vec::from_array(env, [m1.clone(), m2.clone(), m3.clone()]);
    client.configure_upgrade_governance(admin, &3_600u64, &60u32, &members);
    (m1, m2, m3)
}

fn propose(
    env: &Env,
    client: &LumentixContractClient,
    proposer: &Address,
    seed: u8,
) -> u64 {
    let wasm_hash = BytesN::from_array(env, &[seed; 32]);
    let description = String::from_str(env, "Upgrade");
    client.propose_contract_upgrade(proposer, &wasm_hash, &description)
}

#[test]
fn propose_contract_upgrade_opens_voting() {
    let env = Env::default();
    let (admin, client) = setup(&env);
    let (m1, _m2, _m3) = with_members(&env, &client, &admin);

    env.ledger().with_mut(|li| li.timestamp = 10_000);
    let wasm_hash = BytesN::from_array(&env, &[9u8; 32]);
    let description = String::from_str(&env, "Patch fee logic");

    let proposal_id = client.propose_contract_upgrade(&m1, &wasm_hash, &description);
    assert_eq!(proposal_id, 1u64);

    let proposal = client.get_upgrade_proposal(&proposal_id);
    assert_eq!(proposal.proposal_id, proposal_id);
    assert_eq!(proposal.proposer, m1);
    assert_eq!(proposal.new_wasm_hash, wasm_hash);
    assert_eq!(proposal.state, UpgradeState::Pending);
    assert_eq!(proposal.yes_votes, 0);
    assert_eq!(proposal.no_votes, 0);
    assert_eq!(proposal.total_voters, 3);
    assert_eq!(proposal.voting_deadline, 10_000 + 3_600);
}

#[test]
fn propose_contract_upgrade_rejects_non_member_and_duplicate_hash() {
    let env = Env::default();
    let (admin, client) = setup(&env);
    let (m1, _m2, _m3) = with_members(&env, &client, &admin);
    let outsider = Address::generate(&env);

    let wasm_hash = BytesN::from_array(&env, &[3u8; 32]);
    let description = String::from_str(&env, "Upgrade");

    let outsider_result = client.try_propose_contract_upgrade(&outsider, &wasm_hash, &description);
    assert_eq!(outsider_result, Err(Ok(LumentixError::Unauthorized)));

    let _first = client.propose_contract_upgrade(&m1, &wasm_hash, &description);
    let duplicate = client.try_propose_contract_upgrade(&m1, &wasm_hash, &description);
    assert_eq!(duplicate, Err(Ok(LumentixError::UpgradeProposalAlreadyExists)));
}

#[test]
fn cast_governance_vote_records_quorum_progress() {
    let env = Env::default();
    let (admin, client) = setup(&env);
    let (m1, m2, m3) = with_members(&env, &client, &admin);

    let proposal_id = propose(&env, &client, &m1, 4);

    client.cast_governance_vote(&m2, &proposal_id, &true);
    client.cast_governance_vote(&m3, &proposal_id, &false);

    let proposal = client.get_upgrade_proposal(&proposal_id);
    assert_eq!(proposal.yes_votes, 1);
    assert_eq!(proposal.no_votes, 1);

    let yes_vote = client.get_upgrade_vote(&proposal_id, &m2).unwrap();
    assert!(yes_vote.vote_yes);
    let no_vote = client.get_upgrade_vote(&proposal_id, &m3).unwrap();
    assert!(!no_vote.vote_yes);
}

#[test]
fn cast_governance_vote_enforces_membership_window_and_one_vote() {
    let env = Env::default();
    let (admin, client) = setup(&env);
    let (m1, m2, m3) = with_members(&env, &client, &admin);
    let outsider = Address::generate(&env);

    env.ledger().with_mut(|li| li.timestamp = 10_000);
    let proposal_id = propose(&env, &client, &m1, 5);

    let non_member = client.try_cast_governance_vote(&outsider, &proposal_id, &true);
    assert_eq!(non_member, Err(Ok(LumentixError::Unauthorized)));

    client.cast_governance_vote(&m2, &proposal_id, &true);
    let double = client.try_cast_governance_vote(&m2, &proposal_id, &false);
    assert_eq!(double, Err(Ok(LumentixError::UpgradeAlreadyVoted)));

    // After the voting deadline closes, no further votes land.
    env.ledger().with_mut(|li| li.timestamp = 10_000 + 3_600 + 1);
    let late = client.try_cast_governance_vote(&m3, &proposal_id, &true);
    assert_eq!(late, Err(Ok(LumentixError::UpgradeVotingPeriodExpired)));
}

#[test]
fn execute_approved_upgrade_requires_closed_voting_period() {
    let env = Env::default();
    let (admin, client) = setup(&env);
    let (m1, m2, m3) = with_members(&env, &client, &admin);

    env.ledger().with_mut(|li| li.timestamp = 10_000);
    let proposal_id = propose(&env, &client, &m1, 6);

    // Full quorum approves, but the window is still open.
    client.cast_governance_vote(&m1, &proposal_id, &true);
    client.cast_governance_vote(&m2, &proposal_id, &true);
    client.cast_governance_vote(&m3, &proposal_id, &true);

    let early = client.try_execute_approved_upgrade(&m1, &proposal_id);
    assert_eq!(early, Err(Ok(LumentixError::UpgradeVotingPeriodExpired)));
}

#[test]
fn execute_approved_upgrade_requires_approval_quorum() {
    let env = Env::default();
    let (admin, client) = setup(&env);

    // Three members at 67% approval: two yes votes are required to execute.
    let m1 = Address::generate(&env);
    let m2 = Address::generate(&env);
    let m3 = Address::generate(&env);
    let members = Vec::from_array(&env, [m1.clone(), m2.clone(), m3.clone()]);
    client.configure_upgrade_governance(&admin, &3_600u64, &67u32, &members);

    env.ledger().with_mut(|li| li.timestamp = 10_000);
    let proposal_id = propose(&env, &client, &m1, 6);

    // One yes out of three members lands below the two-vote quorum.
    client.cast_governance_vote(&m2, &proposal_id, &true);
    client.cast_governance_vote(&m3, &proposal_id, &false);

    env.ledger().with_mut(|li| li.timestamp = 10_000 + 3_600 + 1);
    let result = client.try_execute_approved_upgrade(&m1, &proposal_id);
    assert_eq!(result, Err(Ok(LumentixError::UpgradeInsufficientVotes)));

    // The proposal stays pending so it is not silently consumed.
    let proposal = client.get_upgrade_proposal(&proposal_id);
    assert_eq!(proposal.state, UpgradeState::Pending);
}

#[test]
fn execute_approved_upgrade_requires_membership() {
    let env = Env::default();
    let (admin, client) = setup(&env);
    let (m1, m2, m3) = with_members(&env, &client, &admin);
    let outsider = Address::generate(&env);

    env.ledger().with_mut(|li| li.timestamp = 10_000);
    let proposal_id = propose(&env, &client, &m1, 6);

    client.cast_governance_vote(&m1, &proposal_id, &true);
    client.cast_governance_vote(&m2, &proposal_id, &true);
    client.cast_governance_vote(&m3, &proposal_id, &true);

    env.ledger().with_mut(|li| li.timestamp = 10_000 + 3_600 + 1);
    let result = client.try_execute_approved_upgrade(&outsider, &proposal_id);
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
}
