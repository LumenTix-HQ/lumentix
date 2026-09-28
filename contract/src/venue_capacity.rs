//! Venue capacity enforcement with a real-time on-chain counter (Issue #1245).
//!
//! An organizer configures a maximum capacity for an event and the contract
//! keeps an on-chain attendance counter alongside it. Every ticket-minting path
//! runs [`guard_mint_against_capacity`] before minting and then advances the
//! counter with [`increment_attendance_counter`], so the venue limit is enforced
//! on-chain rather than trusted to the client.
//!
//! Events that have never had a capacity configured stay unlimited: the guard
//! is a no-op for them, which keeps events created before this feature working
//! exactly as they did.

use crate::error::LumentixError;
use crate::events::{AttendanceCounterIncremented, OverCapacityMintRejected, VenueCapacitySet};
use crate::storage;
use crate::types::PERSISTENT_LIFETIME;
use soroban_sdk::{Env, Symbol};

/// On-chain capacity configuration and live counter for an event.
#[derive(Clone, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub struct VenueCapacity {
    /// Event this capacity applies to.
    pub event_id: u64,
    /// Maximum number of tickets that may be minted for the event.
    pub max_capacity: u32,
    /// Tickets currently minted against the capacity.
    pub minted_count: u32,
    /// Ledger timestamp of the most recent configuration.
    pub configured_at: u64,
}

// ──────────────────────────── Storage keys ──────────────────────────────────

/// Persistent storage key for the capacity record of an event.
/// key: (Symbol("venue_capacity"), event_id: u64)
fn capacity_key(env: &Env, event_id: u64) -> (Symbol, u64) {
    (Symbol::new(env, "venue_capacity"), event_id)
}

/// Return the capacity record for `event_id`, or `None` when the organizer has
/// not configured one.
pub fn try_get_venue_capacity(env: &Env, event_id: u64) -> Option<VenueCapacity> {
    env.storage()
        .persistent()
        .get(&capacity_key(env, event_id))
}

/// Return the capacity record for `event_id`.
///
/// Fails with `VenueCapacityNotConfigured` when no capacity has been set.
pub fn get_venue_capacity(env: &Env, event_id: u64) -> Result<VenueCapacity, LumentixError> {
    try_get_venue_capacity(env, event_id).ok_or(LumentixError::VenueCapacityNotConfigured)
}

/// Persist `capacity` for its event.
fn store_capacity(env: &Env, capacity: &VenueCapacity) {
    let key = capacity_key(env, capacity.event_id);
    env.storage().persistent().set(&key, capacity);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

// ──────────────────────────── Public interface ───────────────────────────────

/// Configure (or update) the maximum venue capacity for `event_id`.
///
/// The first configuration seeds the counter from the event's current
/// `tickets_sold`, so a capacity set after sales have started still reflects
/// reality. Later configurations keep the live counter.
///
/// Fails with `EventNotFound` for an unknown event, `InvalidVenueCapacity` for a
/// zero capacity, and `VenueCapacityExceeded` when the new limit is below the
/// number of tickets already minted.
pub fn set_venue_capacity(
    env: &Env,
    event_id: u64,
    max_capacity: u32,
) -> Result<VenueCapacity, LumentixError> {
    let event = storage::get_event(env, event_id)?;

    if max_capacity == 0 {
        return Err(LumentixError::InvalidVenueCapacity);
    }

    // Reconfiguring must never retroactively unblock over-mints, so the live
    // counter survives; on the first configuration it starts from what has
    // already been sold.
    let minted_count = try_get_venue_capacity(env, event_id)
        .map(|existing| existing.minted_count)
        .unwrap_or(event.tickets_sold);

    if max_capacity < minted_count {
        return Err(LumentixError::VenueCapacityExceeded);
    }

    let capacity = VenueCapacity {
        event_id,
        max_capacity,
        minted_count,
        configured_at: env.ledger().timestamp(),
    };

    store_capacity(env, &capacity);
    VenueCapacitySet::emit(env, event_id, max_capacity, minted_count);

    Ok(capacity)
}

/// Advance the on-chain attendance counter for `event_id` by `quantity`.
///
/// Fails with `VenueCapacityNotConfigured` when no capacity has been set and
/// `VenueCapacityExceeded` when the increment would push the counter past the
/// maximum, leaving the counter untouched. Returns the new counter value.
pub fn increment_attendance_counter(
    env: &Env,
    event_id: u64,
    quantity: u32,
) -> Result<u32, LumentixError> {
    let mut capacity = get_venue_capacity(env, event_id)?;

    let next = capacity.minted_count.saturating_add(quantity);
    if next > capacity.max_capacity {
        OverCapacityMintRejected::emit(env, event_id, quantity, capacity.max_capacity);
        return Err(LumentixError::VenueCapacityExceeded);
    }

    capacity.minted_count = next;
    store_capacity(env, &capacity);
    AttendanceCounterIncremented::emit(env, event_id, next, capacity.max_capacity);

    Ok(next)
}

/// Advance the on-chain attendance counter for `event_id` by `quantity`, but
/// only when the organizer has actually configured a capacity.
///
/// This is what the ticket-minting paths use. It mirrors the permissive
/// behaviour of [`guard_mint_against_capacity`]: an event that never had a
/// capacity set stays unlimited, so minting must not start failing with
/// `VenueCapacityNotConfigured` for events created before this feature existed.
/// Returns the new counter value, or `None` when the event is uncapped.
pub fn increment_attendance_counter_if_configured(
    env: &Env,
    event_id: u64,
    quantity: u32,
) -> Result<Option<u32>, LumentixError> {
    if try_get_venue_capacity(env, event_id).is_none() {
        return Ok(None);
    }

    increment_attendance_counter(env, event_id, quantity).map(Some)
}

/// Give `quantity` seats back to the venue capacity.
///
/// Refunding or revoking a ticket frees the seat it occupied, so the counter
/// has to come back down with it or the venue slowly locks itself. Saturates at
/// zero and is a no-op for events with no configured capacity.
pub fn decrement_attendance_counter(env: &Env, event_id: u64, quantity: u32) {
    let Some(mut capacity) = try_get_venue_capacity(env, event_id) else {
        return;
    };

    capacity.minted_count = capacity.minted_count.saturating_sub(quantity);
    store_capacity(env, &capacity);
}

/// Reject a mint of `quantity` tickets that would breach the venue capacity.
///
/// Check-only: the counter is advanced separately by
/// [`increment_attendance_counter`] once the mint has actually gone through.
/// Unlike [`guard_mint_against_capacity`] this is strict and reports
/// `VenueCapacityNotConfigured` for an event with no capacity set.
pub fn reject_over_capacity_mint(
    env: &Env,
    event_id: u64,
    quantity: u32,
) -> Result<(), LumentixError> {
    let capacity = get_venue_capacity(env, event_id)?;
    check_against_capacity(env, &capacity, quantity)
}

/// The guard every ticket-minting path calls before minting.
///
/// Returns `Err(VenueCapacityExceeded)` when the requested quantity no longer
/// fits inside the configured limit, and `Ok(())` when it fits — or when the
/// organizer has not configured a capacity, in which case the event is
/// unlimited and this is a no-op.
pub fn guard_mint_against_capacity(
    env: &Env,
    event_id: u64,
    quantity: u32,
) -> Result<(), LumentixError> {
    let Some(capacity) = try_get_venue_capacity(env, event_id) else {
        return Ok(());
    };
    check_against_capacity(env, &capacity, quantity)
}

/// Shared capacity comparison, emitting the rejection event on failure.
fn check_against_capacity(
    env: &Env,
    capacity: &VenueCapacity,
    quantity: u32,
) -> Result<(), LumentixError> {
    if capacity.minted_count.saturating_add(quantity) > capacity.max_capacity {
        OverCapacityMintRejected::emit(
            env,
            capacity.event_id,
            quantity,
            capacity.max_capacity,
        );
        return Err(LumentixError::VenueCapacityExceeded);
    }
    Ok(())
}

/// Seats still available under the configured capacity.
///
/// `None` when no capacity is configured, which reads as "unlimited".
pub fn remaining_capacity(env: &Env, event_id: u64) -> Option<u32> {
    try_get_venue_capacity(env, event_id)
        .map(|capacity| capacity.max_capacity.saturating_sub(capacity.minted_count))
}
