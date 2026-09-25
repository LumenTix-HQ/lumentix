//! Venue capacity enforcement with a real-time on-chain counter (Issue #1245).
//!
//! Organizers configure a maximum capacity per event. The contract keeps an
//! on-chain attendance counter that every ticket-minting path must bump via
//! [`increment_attendance_counter`] and gate through
//! [`reject_over_capacity_mint`], preventing mints beyond the venue limit.

use crate::error::LumentixError;
use crate::events::{AttendanceCounterIncremented, OverCapacityMintRejected, VenueCapacitySet};
use soroban_sdk::{Env, Symbol};

/// On-chain capacity configuration and live counter for an event.
#[derive(Clone, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub struct VenueCapacity {
    /// Event this capacity applies to.
    pub event_id: u64,
    /// Maximum number of tickets that may be minted.
    pub max_capacity: u32,
    /// Current number of tickets minted against the capacity.
    pub minted_count: u32,
    /// Ledger timestamp when the capacity was last configured.
    pub configured_at: u64,
}

// ──────────────────────────── Storage keys ───────────────────────────────

/// Key for the capacity record of an event.
fn capacity_key(env: &Env, event_id: u64) -> (Symbol, u64) {
    (Symbol::new(env, "vencap"), event_id)
}

/// Return the live capacity record for `event_id`.
fn load_capacity(env: &Env, event_id: u64) -> Result<VenueCapacity, LumentixError> {
    env.storage()
        .persistent()
        .get(&capacity_key(env, event_id))
        .ok_or(LumentixError::VenueCapacityNotConfigured)
}

// ──────────────────────────── Public interface ───────────────────────────

/// Configure (or update) the maximum venue capacity for `event_id`.
///
/// Returns `InvalidVenueCapacity` when the capacity is zero and
/// `EventNotFound` when the event does not exist. Reconfiguring keeps the
/// existing live counter so an update never silently unblocks over-mints.
pub fn set_venue_capacity(
    env: &Env,
    event_id: u64,
    max_capacity: u32,
) -> Result<VenueCapacity, LumentixError> {
    crate::storage::get_event(env, event_id)?;
    if max_capacity == 0 {
        return Err(LumentixError::InvalidVenueCapacity);
    }

    let current_count = match load_capacity(env, event_id) {
        Ok(existing) => existing.minted_count,
        Err(_) => 0,
    };

    let capacity = VenueCapacity {
        event_id,
        max_capacity,
        minted_count: current_count,
        configured_at: env.ledger().timestamp(),
    };

    env.storage()
        .persistent()
        .set(&capacity_key(env, event_id), &capacity);

    VenueCapacitySet::emit(env, event_id, max_capacity, current_count);

    Ok(capacity)
}

/// Increment the live attendance counter for `event_id`.
///
/// Returns `VenueCapacityExceeded` when the increment would push the counter
/// past the configured maximum and `VenueCapacityNotConfigured` when no
/// capacity has been set. On success returns the new counter value.
pub fn increment_attendance_counter(
    env: &Env,
    event_id: u64,
    quantity: u32,
) -> Result<u32, LumentixError> {
    let mut capacity = load_capacity(env, event_id)?;

    if capacity.minted_count.saturating_add(quantity) > capacity.max_capacity {
        OverCapacityMintRejected::emit(env, event_id, quantity, capacity.max_capacity);
        return Err(LumentixError::VenueCapacityExceeded);
    }

    capacity.minted_count = capacity.minted_count.saturating_add(quantity);
    env.storage()
        .persistent()
        .set(&capacity_key(env, event_id), &capacity);

    AttendanceCounterIncremented::emit(env, event_id, capacity.minted_count, capacity.max_capacity);

    Ok(capacity.minted_count)
}

/// Reject a mint that would breach the venue capacity.
///
/// This is the guard every mint path calls *before* minting. It returns
/// `Err(VenueCapacityExceeded)` when the counter is at or above the max and
/// `Ok(())` when the requested quantity still fits. It is intentionally a
/// check-only function — the counter is advanced by
/// [`increment_attendance_counter`] once the mint proceeds.
pub fn reject_over_capacity_mint(
    env: &Env,
    event_id: u64,
    quantity: u32,
) -> Result<(), LumentixError> {
    let capacity = load_capacity(env, event_id)?;

    if capacity.minted_count.saturating_add(quantity) > capacity.max_capacity {
        OverCapacityMintRejected::emit(env, event_id, quantity, capacity.max_capacity);
        return Err(LumentixError::VenueCapacityExceeded);
    }

    Ok(())
}

/// Return the current on-chain capacity record for `event_id`.
pub fn get_venue_capacity(env: &Env, event_id: u64) -> Result<VenueCapacity, LumentixError> {
    load_capacity(env, event_id)
}

#[cfg(test)]
mod test {
    use crate::error::LumentixError;
    use crate::lumentix_contract::{LumentixContract, LumentixContractClient};
    use crate::types::EventStatus;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Address, Env, String};

    fn create_and_publish_event(env: &Env, client: &LumentixContractClient, organizer: &Address) -> u64 {
        let now = env.ledger().timestamp();
        let event_id = client.create_event(
            organizer,
            &String::from_str(env, "Capacity Event"),
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
    fn sets_venue_capacity() {
        let env = Env::default();
        let (admin, client) = setup(&env);
        let organizer = Address::generate(&env);
        let event_id = create_and_publish_event(&env, &client, &organizer);

        let capacity = client.set_venue_capacity(&admin, &event_id, &500u32);
        assert_eq!(capacity.max_capacity, 500);
        assert_eq!(capacity.minted_count, 0);

        let fetched = client.get_venue_capacity(&event_id);
        assert_eq!(fetched.max_capacity, 500);
    }

    #[test]
    fn rejects_zero_capacity() {
        let env = Env::default();
        let (admin, client) = setup(&env);
        let organizer = Address::generate(&env);
        let event_id = create_and_publish_event(&env, &client, &organizer);

        let result = client.try_set_venue_capacity(&admin, &event_id, &0u32);
        assert_eq!(result, Err(Ok(LumentixError::InvalidVenueCapacity)));
    }

    #[test]
    fn increments_counter_up_to_capacity() {
        let env = Env::default();
        let (admin, client) = setup(&env);
        let organizer = Address::generate(&env);
        let event_id = create_and_publish_event(&env, &client, &organizer);

        client.set_venue_capacity(&admin, &event_id, &3u32);

        assert_eq!(client.increment_attendance_counter(&event_id, &1u32), 1);
        assert_eq!(client.increment_attendance_counter(&event_id, &2u32), 3);
    }

    #[test]
    fn rejects_over_capacity_increment() {
        let env = Env::default();
        let (admin, client) = setup(&env);
        let organizer = Address::generate(&env);
        let event_id = create_and_publish_event(&env, &client, &organizer);

        client.set_venue_capacity(&admin, &event_id, &2u32);
        client.increment_attendance_counter(&event_id, &2u32);

        let result = client.try_increment_attendance_counter(&event_id, &1u32);
        assert_eq!(result, Err(Ok(LumentixError::VenueCapacityExceeded)));
    }

    #[test]
    fn reject_over_capacity_mint_blocks_mints() {
        let env = Env::default();
        let (admin, client) = setup(&env);
        let organizer = Address::generate(&env);
        let event_id = create_and_publish_event(&env, &client, &organizer);

        client.set_venue_capacity(&admin, &event_id, &5u32);
        client.increment_attendance_counter(&event_id, &5u32);

        let result = client.try_reject_over_capacity_mint(&event_id, &1u32);
        assert_eq!(result, Err(Ok(LumentixError::VenueCapacityExceeded)));

        client.reject_over_capacity_mint(&event_id, &0u32);
    }

    #[test]
    fn unconfigured_capacity_errors() {
        let env = Env::default();
        let (_admin, client) = setup(&env);
        let organizer = Address::generate(&env);
        let event_id = create_and_publish_event(&env, &client, &organizer);

        let result = client.try_get_venue_capacity(&event_id);
        assert_eq!(result, Err(Ok(LumentixError::VenueCapacityNotConfigured)));
    }
}