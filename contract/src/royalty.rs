//! On-chain royalty splits for multi-artist events.
//!
//! Provides `set_royalty_splits`, `distribute_royalties`, and
//! `query_royalty_ledger` as free functions consumed by the main contract
//! ([`crate::lumentix_contract::LumentixContract`]).
//!
//! Splits are stored on-chain as a `Map<artist_address, basis_points>` where
//! the basis-point values must sum to exactly 10 000 (100 %). `distribute_royalties`
//! pays each artist out of the event's escrow balance through the contract's
//! configured settlement token, and accumulates a cumulative per-artist ledger.

use crate::error::LumentixError;
use crate::events::{RoyaltiesDistributed, RoyaltySplitsSet};
use crate::storage;
use crate::types::PERSISTENT_LIFETIME;
use soroban_sdk::{Address, Env, Map, Symbol};

/// A split map is valid only when all basis points sum to 100 % (10 000 bps).
pub const ROYALTY_TOTAL_BPS: u32 = 10_000;

// ──────────────────────────── Storage keys ──────────────────────────────────

/// Persistent storage key for the royalty splits map of an event.
/// key: (Symbol("royalty_splits"), event_id: u64)
fn splits_key(env: &Env, event_id: u64) -> (Symbol, u64) {
    (Symbol::new(env, "royalty_splits"), event_id)
}

/// Persistent storage key for the royalty ledger (cumulative paid amounts).
/// key: (Symbol("royalty_ledger"), event_id: u64)
fn ledger_key(env: &Env, event_id: u64) -> (Symbol, u64) {
    (Symbol::new(env, "royalty_ledger"), event_id)
}

// ──────────────────────────── Public interface ───────────────────────────────

/// Store configurable royalty splits for an event.
///
/// `splits` is a map of `artist_address → basis_points` where the sum of all
/// basis-point values must equal 10 000 (i.e. 100 %).
///
/// Fails with `InvalidRoyaltySplit` if the basis-point values do not sum to
/// 10 000. Replaces any previously configured splits for the event.
pub fn set_royalty_splits(
    env: &Env,
    event_id: u64,
    splits: Map<Address, u32>,
) -> Result<(), LumentixError> {
    let total: u32 = splits.values().iter().sum();
    if total != ROYALTY_TOTAL_BPS {
        return Err(LumentixError::InvalidRoyaltySplit);
    }

    env.storage()
        .persistent()
        .set(&splits_key(env, event_id), &splits);
    env.storage()
        .persistent()
        .extend_ttl(
            &splits_key(env, event_id),
            PERSISTENT_LIFETIME,
            PERSISTENT_LIFETIME,
        );

    RoyaltySplitsSet::emit(env, event_id, total);
    Ok(())
}

/// Read the currently configured splits for an event, if any.
pub fn get_royalty_splits(env: &Env, event_id: u64) -> Result<Map<Address, u32>, LumentixError> {
    env.storage()
        .persistent()
        .get(&splits_key(env, event_id))
        .ok_or(LumentixError::RoyaltySplitsNotConfigured)
}

/// Distribute `total_amount` of escrow revenue to the artist wallets according
/// to the stored splits for `event_id`.
///
/// Transfers each artist's share from the contract to their wallet using the
/// contract's settlement token, and accumulates the paid amounts in the
/// per-event royalty ledger.
///
/// Fails with `InvalidAmount` if `total_amount` is not positive,
/// `RoyaltySplitsNotConfigured` if no splits exist for the event, and
/// `InsufficientEscrow` if the event's escrow balance is lower than
/// `total_amount`.
///
/// Returns a map of `artist_address → amount_distributed`, where the returned
/// amounts always sum to exactly `total_amount` (the division remainder from
/// basis-point rounding is credited to the artist with the largest share).
pub fn distribute_royalties(
    env: &Env,
    event_id: u64,
    total_amount: i128,
) -> Result<Map<Address, i128>, LumentixError> {
    if total_amount <= 0 {
        return Err(LumentixError::InvalidAmount);
    }

    let splits = get_royalty_splits(env, event_id)?;

    // Compute each artist's share with integer division, then credit the
    // basis-point rounding remainder to the artist with the largest share so
    // the pay-out never loses (or invents) a single unit.
    let mut distributions: Map<Address, i128> = Map::new(env);
    let mut assigned: i128 = 0;
    let mut largest_artist: Option<Address> = None;
    let mut largest_bps: u32 = 0;

    for (artist, bps) in splits.iter() {
        let share = total_amount * i128::from(bps) / i128::from(ROYALTY_TOTAL_BPS);
        distributions.set(artist.clone(), share);
        assigned = assigned.saturating_add(share);
        if bps > largest_bps {
            largest_bps = bps;
            largest_artist = Some(artist.clone());
        }
    }

    let remainder = total_amount - assigned;
    if remainder != 0 {
        if let Some(artist) = largest_artist {
            let prior = distributions.get(artist.clone()).unwrap_or(0);
            distributions.set(artist, prior + remainder);
        }
    }

    // Settle against the escrow first so a shortfall fails before any
    // transfer is executed.
    storage::deduct_escrow(env, event_id, total_amount)?;

    if let Ok(token_address) = storage::get_token_result(env) {
        let token_client = soroban_sdk::token::Client::new(env, &token_address);
        for (artist, share) in distributions.iter() {
            let share: i128 = share;
            if share > 0 {
                token_client.transfer(&env.current_contract_address(), &artist, &share);
            }
        }
    }

    // Accumulate into the cumulative ledger (for query_royalty_ledger).
    let mut ledger: Map<Address, i128> = env
        .storage()
        .persistent()
        .get(&ledger_key(env, event_id))
        .unwrap_or_else(|| Map::new(env));

    for (artist, share) in distributions.iter() {
        let prior = ledger.get(artist.clone()).unwrap_or(0);
        ledger.set(artist, prior + share);
    }

    env.storage()
        .persistent()
        .set(&ledger_key(env, event_id), &ledger);
    env.storage()
        .persistent()
        .extend_ttl(
            &ledger_key(env, event_id),
            PERSISTENT_LIFETIME,
            PERSISTENT_LIFETIME,
        );

    RoyaltiesDistributed::emit(env, event_id, total_amount);

    Ok(distributions)
}

/// Return the cumulative royalties paid to each artist for an event.
///
/// Returns an empty map if no distributions have been made yet.
pub fn query_royalty_ledger(env: &Env, event_id: u64) -> Map<Address, i128> {
    env.storage()
        .persistent()
        .get(&ledger_key(env, event_id))
        .unwrap_or_else(|| Map::new(env))
}