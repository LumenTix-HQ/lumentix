//! On-chain royalty splits for multi-artist events.
//!
//! Provides `set_royalty_splits`, `distribute_royalties`, and
//! `query_royalty_ledger` as free functions consumed by the main contract.

use soroban_sdk::{Address, Env, Map, Symbol};

// ──────────────────────────── Storage keys ──────────────────────────────────

/// Persistent storage key for the royalty splits map of an event.
/// key: (Symbol("royalty_splits"), event_id: u32)
fn splits_key(env: &Env, event_id: u32) -> (Symbol, u32) {
    (Symbol::new(env, "royalty_splits"), event_id)
}

/// Persistent storage key for the royalty ledger (cumulative paid amounts).
/// key: (Symbol("royalty_ledger"), event_id: u32)
fn ledger_key(env: &Env, event_id: u32) -> (Symbol, u32) {
    (Symbol::new(env, "royalty_ledger"), event_id)
}

// ──────────────────────────── Public interface ───────────────────────────────

/// Store configurable royalty splits for an event.
///
/// `splits` is a map of `artist_address → basis_points` where the sum of all
/// basis-point values must equal 10 000 (i.e. 100 %).
///
/// Panics if the basis-point values do not sum to 10 000.
pub fn set_royalty_splits(
    env: &Env,
    event_id: u32,
    splits: Map<Address, u32>,
) {
    let total: u32 = splits.values().iter().sum();
    if total != 10_000 {
        panic!("Royalty splits must sum to 10000 basis points (100%)");
    }
    env.storage()
        .persistent()
        .set(&splits_key(env, event_id), &splits);

    env.events().publish(
        (Symbol::new(env, "royalty_set"), event_id),
        total,
    );
}

/// Distribute `total_amount` of revenue to the artist wallets according to
/// the stored splits for `event_id`.
///
/// Returns a map of `artist_address → amount_distributed`.
///
/// Panics if no splits have been configured for the event.
pub fn distribute_royalties(
    env: &Env,
    event_id: u32,
    total_amount: i128,
) -> Map<Address, i128> {
    let splits: Map<Address, u32> = env
        .storage()
        .persistent()
        .get(&splits_key(env, event_id))
        .unwrap_or_else(|| panic!("No royalty splits configured for event {event_id}"));

    // Load or initialise the cumulative ledger.
    let mut ledger: Map<Address, i128> = env
        .storage()
        .persistent()
        .get(&ledger_key(env, event_id))
        .unwrap_or_else(|| Map::new(env));

    let mut distributions: Map<Address, i128> = Map::new(env);

    for (artist, bps) in splits.iter() {
        let amount = total_amount * i128::from(bps) / 10_000;
        distributions.set(artist.clone(), amount);

        // Accumulate into the ledger.
        let prior = ledger.get(artist.clone()).unwrap_or(0);
        ledger.set(artist, prior + amount);
    }

    env.storage()
        .persistent()
        .set(&ledger_key(env, event_id), &ledger);

    env.events().publish(
        (Symbol::new(env, "royalties_dist"), event_id),
        total_amount,
    );

    distributions
}

/// Return the cumulative royalties paid to each artist for an event.
///
/// Returns an empty map if no distributions have been made yet.
pub fn query_royalty_ledger(env: &Env, event_id: u32) -> Map<Address, i128> {
    env.storage()
        .persistent()
        .get(&ledger_key(env, event_id))
        .unwrap_or_else(|| Map::new(env))
}
