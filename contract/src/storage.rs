use soroban_sdk::{Address, Env};
use crate::error::LumentixError;
use crate::types::{Event, Ticket};

// Storage keys
const INITIALIZED: &str = "INIT";
const ADMIN: &str = "ADMIN";
const EVENT_ID_COUNTER: &str = "EVENT_CTR";
const TICKET_ID_COUNTER: &str = "TICKET_CTR";
const EVENT_PREFIX: &str = "EVENT_";
const TICKET_PREFIX: &str = "TICKET_";
const ESCROW_PREFIX: &str = "ESCROW_";

/// Check if contract is initialized
pub fn is_initialized(env: &Env) -> bool {
    env.storage().instance().has(&INITIALIZED)
}

/// Mark contract as initialized
pub fn set_initialized(env: &Env) {
    env.storage().instance().set(&INITIALIZED, &true);
}

/// Set admin address
pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&ADMIN, admin);
}

/// Get admin address
pub fn get_admin(env: &Env) -> Address {
    env.storage().instance().get(&ADMIN).unwrap()
}

/// Get next event ID
pub fn get_next_event_id(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get(&EVENT_ID_COUNTER)
        .unwrap_or(1)
}

/// Increment event ID counter
pub fn increment_event_id(env: &Env) {
    let next_id = get_next_event_id(env) + 1;
    env.storage().instance().set(&EVENT_ID_COUNTER, &next_id);
}

/// Get next ticket ID
pub fn get_next_ticket_id(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get(&TICKET_ID_COUNTER)
        .unwrap_or(1)
}

/// Increment ticket ID counter
pub fn increment_ticket_id(env: &Env) {
    let next_id = get_next_ticket_id(env) + 1;
    env.storage().instance().set(&TICKET_ID_COUNTER, &next_id);
}

/// Set event data
pub fn set_event(env: &Env, event_id: u64, event: &Event) {
    let key = (EVENT_PREFIX, event_id);
    env.storage().persistent().set(&key, event);
}

/// Get event data
pub fn get_event(env: &Env, event_id: u64) -> Result<Event, LumentixError> {
    let key = (EVENT_PREFIX, event_id);
    env.storage()
        .persistent()
        .get(&key)
        .ok_or(LumentixError::EventNotFound)
}

/// Set ticket data
pub fn set_ticket(env: &Env, ticket_id: u64, ticket: &Ticket) {
    let key = (TICKET_PREFIX, ticket_id);
    env.storage().persistent().set(&key, ticket);
}

/// Get ticket data
pub fn get_ticket(env: &Env, ticket_id: u64) -> Result<Ticket, LumentixError> {
    let key = (TICKET_PREFIX, ticket_id);
    env.storage()
        .persistent()
        .get(&key)
        .ok_or(LumentixError::TicketNotFound)
}

/// Add amount to escrow for an event
pub fn add_escrow(env: &Env, event_id: u64, amount: i128) {
    let key = (ESCROW_PREFIX, event_id);
    let current: i128 = env.storage().persistent().get(&key).unwrap_or(0);
    env.storage().persistent().set(&key, &(current + amount));
}

/// Get escrow balance for an event
pub fn get_escrow(env: &Env, event_id: u64) -> Result<i128, LumentixError> {
    let key = (ESCROW_PREFIX, event_id);
    Ok(env.storage().persistent().get(&key).unwrap_or(0))
}

/// Deduct amount from escrow
pub fn deduct_escrow(env: &Env, event_id: u64, amount: i128) -> Result<(), LumentixError> {
    let key = (ESCROW_PREFIX, event_id);
    let current: i128 = env.storage().persistent().get(&key).unwrap_or(0);
    
    if current < amount {
        return Err(LumentixError::InsufficientEscrow);
    }
    
    env.storage().persistent().set(&key, &(current - amount));
    Ok(())
}

/// Clear escrow for an event
pub fn clear_escrow(env: &Env, event_id: u64) {
    let key = (ESCROW_PREFIX, event_id);
    env.storage().persistent().set(&key, &0i128);
}
