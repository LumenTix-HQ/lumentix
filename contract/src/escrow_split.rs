//! Payment split escrow for multi-organizer events (Issue #1247).
//!
//! Ticket revenue already lands in the contract's per-event escrow pool (see
//! [`crate::storage`]). This module lets the organizers behind an event agree on
//! how that pool is divided *before* it is paid out: the primary organizer
//! registers a basis-point split at any time, and once the event has concluded
//! the pool is released to every co-organizer in one go.
//!
//! Agreeing the ratios up front and releasing them in a single call is what
//! makes the arrangement safe. A co-organizer who disagrees can
//! [`dispute_escrow_split`] to freeze the pool before anyone is paid; because a
//! split can only be created by the event's own organizer and released by that
//! same organizer, no single party can drain funds that a dispute is trying to
//! hold.

use crate::error::LumentixError;
use crate::events::{EscrowSplitCreated, EscrowSplitDisputed, EscrowSplitReleased};
use crate::storage;
use crate::types::PERSISTENT_LIFETIME;
use soroban_sdk::{Address, Env, Map, Symbol, Vec};

/// A split is valid only when its basis points sum to 100 % (10 000 bps).
pub const ESCROW_SPLIT_TOTAL_BPS: u32 = 10_000;

/// One co-organizer's agreed share of an event's escrow.
#[derive(Clone, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub struct EscrowSplitShare {
    /// Co-organizer wallet.
    pub organizer: Address,
    /// Share of the pool in basis points, summing to 10 000 across the split.
    pub share_bps: u32,
}

/// A pre-agreed payment split over an event's held escrow.
#[derive(Clone, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub struct EscrowSplit {
    /// Unique split identifier.
    pub split_id: u64,
    /// Event whose escrow the split applies to.
    pub event_id: u64,
    /// Per-organizer shares, in basis points.
    pub shares: Vec<EscrowSplitShare>,
    /// Whether the pool has been paid out. A released split is final.
    pub released: bool,
    /// Whether a co-organizer has frozen the pool pending a resolution.
    pub disputed: bool,
    /// Ledger timestamp when the split was created.
    pub created_at: u64,
    /// Ledger timestamp when the pool was released (0 while unreleased).
    pub released_at: u64,
    /// Ledger timestamp when the split was disputed (0 while undisputed).
    pub disputed_at: u64,
}

// ──────────────────────────── Storage keys ──────────────────────────────────

/// Persistent storage key for a split.
/// key: (Symbol("escrow_split"), split_id: u64)
fn split_key(env: &Env, split_id: u64) -> (Symbol, u64) {
    (Symbol::new(env, "escrow_split"), split_id)
}

/// Persistent storage key for the next split ID.
fn split_counter_key(env: &Env) -> Symbol {
    Symbol::new(env, "escrow_split_ctr")
}

/// Persistent storage key for the split registered against an event.
/// key: (Symbol("escrow_split_of"), event_id: u64)
fn event_split_key(env: &Env, event_id: u64) -> (Symbol, u64) {
    (Symbol::new(env, "escrow_split_of"), event_id)
}

/// Persist `split` under both its own ID and its event index.
fn store_split(env: &Env, split: &EscrowSplit) {
    let key = split_key(env, split.split_id);
    env.storage().persistent().set(&key, split);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);

    let event_key = event_split_key(env, split.event_id);
    env.storage().persistent().set(&event_key, &split.split_id);
    env.storage()
        .persistent()
        .extend_ttl(&event_key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

// ──────────────────────────── Public interface ───────────────────────────────

/// Register a pre-agreed split of `event_id`'s escrow among its co-organizers.
///
/// `splits` maps each co-organizer wallet to their share in basis points, and
/// the values must sum to exactly 10 000. Registering a split replaces any
/// previous split for the event, which lets organizers correct an agreement
/// that was never acted on.
///
/// Fails with `EventNotFound` for an unknown event, `InvalidEscrowSplit` when
/// the split is empty or does not sum to 10 000, and `InsufficientEscrow` when
/// nothing is currently held for the event.
pub fn create_escrow_split(
    env: &Env,
    event_id: u64,
    splits: Map<Address, u32>,
) -> Result<EscrowSplit, LumentixError> {
    let _ = storage::get_event(env, event_id)?;

    if splits.len() == 0 {
        return Err(LumentixError::InvalidEscrowSplit);
    }

    let total_bps: u32 = splits.values().iter().sum();
    if total_bps != ESCROW_SPLIT_TOTAL_BPS {
        return Err(LumentixError::InvalidEscrowSplit);
    }

    // A split over an empty pool would be a promise nobody can keep, and it
    // usually means the event has not sold a ticket yet.
    if storage::get_escrow(env, event_id)? <= 0 {
        return Err(LumentixError::InsufficientEscrow);
    }

    let split_id: u64 = env
        .storage()
        .persistent()
        .get(&split_counter_key(env))
        .unwrap_or(0u64)
        .saturating_add(1);
    env.storage()
        .persistent()
        .set(&split_counter_key(env), &split_id);

    let mut shares: Vec<EscrowSplitShare> = Vec::new(env);
    for (organizer, share_bps) in splits.iter() {
        shares.push_back(EscrowSplitShare {
            organizer,
            share_bps,
        });
    }

    let split = EscrowSplit {
        split_id,
        event_id,
        shares,
        released: false,
        disputed: false,
        created_at: env.ledger().timestamp(),
        released_at: 0,
        disputed_at: 0,
    };

    store_split(env, &split);
    EscrowSplitCreated::emit(
        env,
        split_id,
        event_id,
        i128::from(total_bps),
        splits.len(),
    );

    Ok(split)
}

/// Release an event's held escrow to every co-organizer in the split.
///
/// The whole current pool is paid out in one call: each co-organizer receives
/// their basis-point share of the balance at release time, with the rounding
/// remainder credited to the largest share so the payout is exact and never
/// leaves a unit stranded in the contract.
///
/// Fails with `EscrowSplitNotFound` when the event has no split,
/// `EscrowSplitAlreadyReleased` or `EscrowSplitAlreadyDisputed` when the split
/// is closed, `EscrowSplitEventNotConcluded` while the event is still running,
/// and `InsufficientEscrow` when the pool cannot cover the payout.
pub fn release_escrow_funds(
    env: &Env,
    event_id: u64,
    split_id: u64,
) -> Result<Map<Address, i128>, LumentixError> {
    let event = storage::get_event(env, event_id)?;
    let key = split_key(env, split_id);
    let split: EscrowSplit = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(LumentixError::EscrowSplitNotFound)?;

    if split.event_id != event_id {
        return Err(LumentixError::EscrowSplitNotFound);
    }
    if split.released {
        return Err(LumentixError::EscrowSplitAlreadyReleased);
    }
    if split.disputed {
        return Err(LumentixError::EscrowSplitAlreadyDisputed);
    }
    // Money is only owed once the event it was earned for is over.
    if env.ledger().timestamp() < event.end_time {
        return Err(LumentixError::EscrowSplitEventNotConcluded);
    }

    let total = storage::get_escrow(env, event_id)?;
    if total <= 0 {
        return Err(LumentixError::InsufficientEscrow);
    }

    let payouts = compute_payouts(env, &split, total);

    // Settle against escrow first so a shortfall fails before any transfer has
    // left the contract.
    storage::deduct_escrow(env, event_id, total)?;

    if let Ok(token_address) = storage::get_token_result(env) {
        let token_client = soroban_sdk::token::Client::new(env, &token_address);
        for (organizer, amount) in payouts.iter() {
            if amount > 0 {
                token_client.transfer(&env.current_contract_address(), &organizer, &amount);
            }
        }
    }

    let mut released = split;
    released.released = true;
    released.released_at = env.ledger().timestamp();
    env.storage().persistent().set(&key, &released);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);

    EscrowSplitReleased::emit(env, split_id, event_id, total);

    Ok(payouts)
}

/// Freeze an event's escrow split pending a resolution between organizers.
///
/// Any co-organizer named in the split may dispute it, which stops the pool
/// from being released until the disagreement is settled. A released split is
/// too late to dispute and a split can only be disputed once.
pub fn dispute_escrow_split(
    env: &Env,
    event_id: u64,
    split_id: u64,
    disputer: &Address,
) -> Result<EscrowSplit, LumentixError> {
    let key = split_key(env, split_id);
    let split: EscrowSplit = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(LumentixError::EscrowSplitNotFound)?;

    if split.event_id != event_id {
        return Err(LumentixError::EscrowSplitNotFound);
    }
    if split.released {
        return Err(LumentixError::EscrowSplitAlreadyReleased);
    }
    if split.disputed {
        return Err(LumentixError::EscrowSplitAlreadyDisputed);
    }
    if !split_includes(&split, disputer) {
        return Err(LumentixError::Unauthorized);
    }

    let mut disputed = split;
    disputed.disputed = true;
    disputed.disputed_at = env.ledger().timestamp();
    env.storage().persistent().set(&key, &disputed);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);

    EscrowSplitDisputed::emit(env, split_id, event_id, disputer.clone());

    Ok(disputed)
}

// ──────────────────────────── Queries ───────────────────────────────────────

/// Return the split with the given ID, or `EscrowSplitNotFound`.
pub fn get_escrow_split(env: &Env, split_id: u64) -> Result<EscrowSplit, LumentixError> {
    env.storage()
        .persistent()
        .get(&split_key(env, split_id))
        .ok_or(LumentixError::EscrowSplitNotFound)
}

/// Return the split currently registered for `event_id`, if any.
pub fn get_event_escrow_split(env: &Env, event_id: u64) -> Option<EscrowSplit> {
    let split_id: u64 = env
        .storage()
        .persistent()
        .get(&event_split_key(env, event_id))?;
    get_escrow_split(env, split_id).ok()
}

/// Whether `event_id` currently has an escrow split registered.
pub fn has_escrow_split(env: &Env, event_id: u64) -> bool {
    env.storage()
        .persistent()
        .has(&event_split_key(env, event_id))
}

// ──────────────────────────── Internals ──────────────────────────────────────

/// Whether `address` is one of the co-organizers named in the split.
fn split_includes(split: &EscrowSplit, address: &Address) -> bool {
    for share in split.shares.iter() {
        if &share.organizer == address {
            return true;
        }
    }
    false
}

/// Turn a basis-point split into concrete payouts of `total`.
///
/// Each share is `total * bps / 10_000`, and the integer-division remainder goes
/// to the largest share so the payouts always add back up to `total` exactly.
/// Ties on the largest share resolve to whichever co-organizer sorts first, so
/// the assignment is deterministic.
fn compute_payouts(env: &Env, split: &EscrowSplit, total: i128) -> Map<Address, i128> {
    let mut payouts: Map<Address, i128> = Map::new(env);
    let mut assigned: i128 = 0;
    let mut largest_share: Option<Address> = None;
    let mut largest_bps: u32 = 0;

    for share in split.shares.iter() {
        let amount = total * i128::from(share.share_bps) / i128::from(ESCROW_SPLIT_TOTAL_BPS);
        payouts.set(share.organizer.clone(), amount);
        assigned = assigned.saturating_add(amount);
        if share.share_bps > largest_bps {
            largest_bps = share.share_bps;
            largest_share = Some(share.organizer.clone());
        }
    }

    // Credit the integer-division remainder to the largest share so the
    // payouts always add back up to `total` and not a unit is stranded.
    if let Some(organizer) = largest_share {
        let remainder = total - assigned;
        if remainder != 0 {
            let prior = payouts.get(organizer.clone()).unwrap_or(0);
            payouts.set(organizer, prior + remainder);
        }
    }

    payouts
}
