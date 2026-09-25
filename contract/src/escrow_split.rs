//! Payment split escrow for multi-organizer events (Issue #1247).
//!
//! Ticket revenue is held in the existing per-event escrow pool. This module
//! lets co-organizers register a pre-agreed split of that escrow and, once
//! the event concludes, release each share from the pool. An organizer may
//! also raise a dispute to freeze the funds until the disagreement is
//! resolved.

use crate::error::LumentixError;
use crate::events::{EscrowSplitCreated, EscrowSplitDisputed, EscrowSplitReleased};
use crate::storage;
use soroban_sdk::{Address, Env, Symbol, Vec};

/// A single organizer's share of an escrow split.
#[derive(Clone, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub struct EscrowSplitShare {
    /// Co-organizer wallet.
    pub organizer: Address,
    /// Amount of escrowed funds allocated to this organizer.
    pub amount: i128,
    /// Whether this share has been released to the organizer.
    pub paid: bool,
}

/// An on-chain payment split over an event's held escrow.
#[derive(Clone, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub struct EscrowSplit {
    /// Unique split identifier.
    pub split_id: u64,
    /// Event whose escrow the split applies to.
    pub event_id: u64,
    /// Total amount covered by the split (equals the event escrow).
    pub total_amount: i128,
    /// Per-organizer shares.
    pub shares: Vec<EscrowSplitShare>,
    /// Whether the split has been fully released.
    pub released: bool,
    /// Whether the split is currently under dispute.
    pub disputed: bool,
    /// Ledger timestamp when the split was created.
    pub created_at: u64,
    /// Ledger timestamp when the split was released (0 = not released).
    pub released_at: u64,
}

// ──────────────────────────── Storage keys ───────────────────────────────

/// Counter for the next split ID.
fn split_counter_key(env: &Env) -> Symbol {
    Symbol::new(env, "esplit_ctr")
}

/// Key for a specific split.
fn split_key(env: &Env, split_id: u64) -> (Symbol, u64) {
    (Symbol::new(env, "esplit"), split_id)
}

// ──────────────────────────── Public interface ───────────────────────────

/// Create an escrow split for `event_id`.
///
/// `organizers` and `shares` must be non-empty and of equal length. Every
/// share must be positive and the shares must sum to the event's current
/// escrow balance. Returns `InvalidEscrowSplit` when these constraints are
/// violated and `EventNotFound` when the event does not exist.
pub fn create_escrow_split(
    env: &Env,
    _caller: Address,
    event_id: u64,
    organizers: Vec<Address>,
    shares: Vec<i128>,
) -> Result<EscrowSplit, LumentixError> {
    storage::get_event(env, event_id)?;

    if organizers.is_empty() || organizers.len() != shares.len() {
        return Err(LumentixError::InvalidEscrowSplit);
    }

    let mut split_total: i128 = 0;
    for share in shares.iter() {
        if share <= 0 {
            return Err(LumentixError::InvalidEscrowSplit);
        }
        split_total += share;
    }

    let escrow_balance = storage::get_escrow(env, event_id)?;
    if escrow_balance <= 0 || split_total != escrow_balance {
        return Err(LumentixError::InvalidEscrowSplit);
    }

    let split_id: u64 = env
        .storage()
        .persistent()
        .get(&split_counter_key(env))
        .unwrap_or(0u64)
        + 1;
    env.storage()
        .persistent()
        .set(&split_counter_key(env), &split_id);

    let mut share_list: Vec<EscrowSplitShare> = Vec::new(env);
    let mut idx: u32 = 0;
    for organizer in organizers.iter() {
        let amount: i128 = shares.get(idx).unwrap_or(0);
        share_list.push_back(EscrowSplitShare {
            organizer,
            amount,
            paid: false,
        });
        idx = idx.saturating_add(1);
    }

    let split = EscrowSplit {
        split_id,
        event_id,
        total_amount: split_total,
        shares: share_list,
        released: false,
        disputed: false,
        created_at: env.ledger().timestamp(),
        released_at: 0,
    };

    env.storage()
        .persistent()
        .set(&split_key(env, split_id), &split);

    EscrowSplitCreated::emit(env, split_id, event_id, split_total, organizers.len());

    Ok(split)
}

/// Whether `caller` is one of the organizers named in the split.
fn is_organizer(split: &EscrowSplit, caller: &Address) -> bool {
    for share in split.shares.iter() {
        if &share.organizer == caller {
            return true;
        }
    }
    false
}

/// Release escrow funds to each co-organizer according to the split.
///
/// Only an organizer named in the split may trigger the release. A released
/// or disputed split cannot be released again. Each share is deducted from
/// the event's escrow pool and marked as paid.
pub fn release_escrow_funds(
    env: &Env,
    caller: Address,
    split_id: u64,
) -> Result<EscrowSplit, LumentixError> {
    let key = split_key(env, split_id);
    let mut split: EscrowSplit = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(LumentixError::EscrowSplitNotFound)?;

    if split.released {
        return Err(LumentixError::EscrowSplitAlreadyReleased);
    }
    if split.disputed {
        return Err(LumentixError::EscrowSplitDisputed);
    }
    if !is_organizer(&split, &caller) {
        return Err(LumentixError::Unauthorized);
    }

    let mut updated_shares: Vec<EscrowSplitShare> = Vec::new(env);
    for share in split.shares.iter() {
        storage::deduct_escrow(env, split.event_id, share.amount)?;
        let mut updated = share;
        updated.paid = true;
        updated_shares.push_back(updated);
    }
    split.shares = updated_shares;
    split.released = true;
    split.released_at = env.ledger().timestamp();
    env.storage().persistent().set(&key, &split);

    EscrowSplitReleased::emit(env, split_id, split.event_id, split.total_amount);

    Ok(split)
}

/// Dispute an escrow split, freezing the funds until the dispute is resolved.
///
/// Only an organizer named in the split may dispute it. A released split can
/// no longer be disputed, and a split may only be disputed once.
pub fn dispute_escrow_split(
    env: &Env,
    caller: Address,
    split_id: u64,
) -> Result<EscrowSplit, LumentixError> {
    let key = split_key(env, split_id);
    let mut split: EscrowSplit = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(LumentixError::EscrowSplitNotFound)?;

    if split.released {
        return Err(LumentixError::EscrowSplitAlreadyReleased);
    }
    if split.disputed {
        return Err(LumentixError::EscrowSplitAlreadyDisputed);
    }
    if !is_organizer(&split, &caller) {
        return Err(LumentixError::Unauthorized);
    }

    split.disputed = true;
    env.storage().persistent().set(&key, &split);

    EscrowSplitDisputed::emit(env, split_id, split.event_id, caller);

    Ok(split)
}

/// Return the escrow split with the given ID, or `EscrowSplitNotFound`.
pub fn get_escrow_split(env: &Env, split_id: u64) -> Result<EscrowSplit, LumentixError> {
    env.storage()
        .persistent()
        .get(&split_key(env, split_id))
        .ok_or(LumentixError::EscrowSplitNotFound)
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::error::LumentixError;
    use crate::lumentix_contract::{LumentixContract, LumentixContractClient};
    use crate::types::EventStatus;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::testutils::Ledger as _;
    use soroban_sdk::{Env, String, Vec};

    fn create_and_publish_event(
        env: &Env,
        client: &LumentixContractClient,
        organizer: &Address,
    ) -> u64 {
        let now = env.ledger().timestamp();
        let event_id = client.create_event(
            organizer,
            &String::from_str(env, "Multi Organizer"),
            &String::from_str(env, "Description"),
            &String::from_str(env, "Location"),
            &(now + 1_000),
            &(now + 2_000),
            &100i128,
            &50u32,
        );
        client.update_event_status(&event_id, &EventStatus::Published, organizer);
        event_id
    }

    fn setup(env: &Env) -> (Address, LumentixContractClient<'_>) {
        env.mock_all_auths();
        let contract_id = env.register(LumentixContract, ());
        let client = LumentixContractClient::new(env, &contract_id);
        let admin = Address::generate(env);
        client.initialize(&admin);
        (admin, client)
    }

    #[test]
    fn creates_split_matching_escrow_balance() {
        let env = Env::default();
        let (_admin, client) = setup(&env);
        let organizer_a = Address::generate(&env);
        let organizer_b = Address::generate(&env);
        let buyer = Address::generate(&env);

        let event_id = create_and_publish_event(&env, &client, &organizer_a);
        client.purchase_ticket(&buyer, &event_id, &100i128);

        let mut organizers: Vec<Address> = Vec::new(&env);
        organizers.push_back(organizer_a.clone());
        organizers.push_back(organizer_b.clone());

        let mut shares: Vec<i128> = Vec::new(&env);
        shares.push_back(60i128);
        shares.push_back(40i128);

        let split = client.create_escrow_split(&organizer_a, &event_id, &organizers, &shares);
        assert_eq!(split.total_amount, 100);
        assert_eq!(split.shares.len(), 2);
        assert_eq!(split.shares.get(0).unwrap().amount, 60);
        assert_eq!(split.shares.get(1).unwrap().amount, 40);
        assert!(!split.released);
        assert!(!split.disputed);
    }

    #[test]
    fn rejects_split_without_matching_escrow() {
        let env = Env::default();
        let (_admin, client) = setup(&env);
        let organizer_a = Address::generate(&env);
        let organizer_b = Address::generate(&env);

        let buyer = Address::generate(&env);
        let event_id = create_and_publish_event(&env, &client, &organizer_a);
        client.purchase_ticket(&buyer, &event_id, &100i128);

        let mut organizers: Vec<Address> = Vec::new(&env);
        organizers.push_back(organizer_a.clone());
        organizers.push_back(organizer_b);

        let mut shares: Vec<i128> = Vec::new(&env);
        shares.push_back(10i128);
        shares.push_back(40i128);

        let result = client.try_create_escrow_split(&organizer_a, &event_id, &organizers, &shares);
        assert_eq!(result, Err(Ok(LumentixError::InvalidEscrowSplit)));
    }

    #[test]
    fn releases_funds_to_all_organizers() {
        let env = Env::default();
        env.ledger().set_timestamp(1_700_000_000);
        let (_admin, client) = setup(&env);
        let organizer_a = Address::generate(&env);
        let organizer_b = Address::generate(&env);
        let buyer = Address::generate(&env);

        let event_id = create_and_publish_event(&env, &client, &organizer_a);
        client.purchase_ticket(&buyer, &event_id, &100i128);

        let mut organizers: Vec<Address> = Vec::new(&env);
        organizers.push_back(organizer_a.clone());
        organizers.push_back(organizer_b.clone());

        let mut shares: Vec<i128> = Vec::new(&env);
        shares.push_back(60i128);
        shares.push_back(40i128);

        let split = client.create_escrow_split(&organizer_a, &event_id, &organizers, &shares);
        let released = client.release_escrow_funds(&organizer_b, &split.split_id);

        assert!(released.released);
        assert!(released.released_at > 0);
        assert!(released.shares.get(0).unwrap().paid);
        assert!(released.shares.get(1).unwrap().paid);
        assert_eq!(client.get_escrow_balance(&event_id), 0);
    }

    #[test]
    fn cannot_release_twice() {
        let env = Env::default();
        let (_admin, client) = setup(&env);
        let organizer_a = Address::generate(&env);
        let organizer_b = Address::generate(&env);
        let buyer = Address::generate(&env);

        let event_id = create_and_publish_event(&env, &client, &organizer_a);
        client.purchase_ticket(&buyer, &event_id, &100i128);

        let mut organizers: Vec<Address> = Vec::new(&env);
        organizers.push_back(organizer_a.clone());
        organizers.push_back(organizer_b.clone());

        let mut shares: Vec<i128> = Vec::new(&env);
        shares.push_back(50i128);
        shares.push_back(50i128);

        let split = client.create_escrow_split(&organizer_a, &event_id, &organizers, &shares);
        client.release_escrow_funds(&organizer_a, &split.split_id);

        let result = client.try_release_escrow_funds(&organizer_a, &split.split_id);
        assert_eq!(result, Err(Ok(LumentixError::EscrowSplitAlreadyReleased)));
    }

    #[test]
    fn only_organizers_can_release() {
        let env = Env::default();
        let (_admin, client) = setup(&env);
        let organizer_a = Address::generate(&env);
        let organizer_b = Address::generate(&env);
        let buyer = Address::generate(&env);
        let intruder = Address::generate(&env);

        let event_id = create_and_publish_event(&env, &client, &organizer_a);
        client.purchase_ticket(&buyer, &event_id, &100i128);

        let mut organizers: Vec<Address> = Vec::new(&env);
        organizers.push_back(organizer_a.clone());
        organizers.push_back(organizer_b.clone());

        let mut shares: Vec<i128> = Vec::new(&env);
        shares.push_back(50i128);
        shares.push_back(50i128);

        let split = client.create_escrow_split(&organizer_a, &event_id, &organizers, &shares);
        let result = client.try_release_escrow_funds(&intruder, &split.split_id);
        assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
    }

    #[test]
    fn dispute_freezes_release() {
        let env = Env::default();
        let (_admin, client) = setup(&env);
        let organizer_a = Address::generate(&env);
        let organizer_b = Address::generate(&env);
        let buyer = Address::generate(&env);

        let event_id = create_and_publish_event(&env, &client, &organizer_a);
        client.purchase_ticket(&buyer, &event_id, &100i128);

        let mut organizers: Vec<Address> = Vec::new(&env);
        organizers.push_back(organizer_a.clone());
        organizers.push_back(organizer_b.clone());

        let mut shares: Vec<i128> = Vec::new(&env);
        shares.push_back(50i128);
        shares.push_back(50i128);

        let split = client.create_escrow_split(&organizer_a, &event_id, &organizers, &shares);
        let disputed = client.dispute_escrow_split(&organizer_b, &split.split_id);
        assert!(disputed.disputed);

        let result = client.try_release_escrow_funds(&organizer_a, &split.split_id);
        assert_eq!(result, Err(Ok(LumentixError::EscrowSplitDisputed)));
    }

    #[test]
    fn get_escrow_split_returns_not_found() {
        let env = Env::default();
        let (_admin, client) = setup(&env);
        let result = client.try_get_escrow_split(&99);
        assert_eq!(result, Err(Ok(LumentixError::EscrowSplitNotFound)));
    }
}
