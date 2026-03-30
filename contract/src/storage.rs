use crate::error::LumentixError;
use crate::types::{Event, Ticket, INSTANCE_LIFETIME, PERSISTENT_LIFETIME};
use soroban_sdk::{Address, Env};

// Storage keys
const INITIALIZED: &str = "INIT";
const ADMIN: &str = "ADMIN";
const TOKEN: &str = "TOKEN";
const EVENT_ID_COUNTER: &str = "EVENT_CTR";
const TICKET_ID_COUNTER: &str = "TICKET_CTR";
const EVENT_PREFIX: &str = "EVENT_";
const TICKET_PREFIX: &str = "TICKET_";
const ESCROW_PREFIX: &str = "ESCROW_";
const PLATFORM_FEE_BPS: &str = "PLATFORM_FEE_BPS";
const PLATFORM_BALANCE: &str = "PLATFORM_BAL";

/// Check if contract is initialized
pub fn is_initialized(env: &Env) -> bool {
    let has = env.storage().instance().has(&INITIALIZED);
    if has {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
    }
    has
}

/// Mark contract as initialized
pub fn set_initialized(env: &Env) {
    env.storage().instance().set(&INITIALIZED, &true);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
}

/// Set admin address
pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&ADMIN, admin);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
}

/// Get admin address
pub fn get_admin(env: &Env) -> Address {
    let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
    admin
}

/// Set token address
pub fn set_token(env: &Env, token: &Address) {
    env.storage().instance().set(&TOKEN, token);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
}

/// Get token address
pub fn get_token(env: &Env) -> Address {
    let token: Address = env.storage().instance().get(&TOKEN).unwrap();
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
    token
}

/// Get next event ID
pub fn get_next_event_id(env: &Env) -> u64 {
    let id = env.storage().instance().get(&EVENT_ID_COUNTER).unwrap_or(1);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
    id
}

/// Increment event ID counter
pub fn increment_event_id(env: &Env) {
    let next_id = get_next_event_id(env) + 1;
    env.storage().instance().set(&EVENT_ID_COUNTER, &next_id);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
}

/// Get next ticket ID
pub fn get_next_ticket_id(env: &Env) -> u64 {
    let id = env
        .storage()
        .instance()
        .get(&TICKET_ID_COUNTER)
        .unwrap_or(1);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
    id
}

/// Increment ticket ID counter
pub fn increment_ticket_id(env: &Env) {
    let next_id = get_next_ticket_id(env) + 1;
    env.storage().instance().set(&TICKET_ID_COUNTER, &next_id);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
}

/// Set event data
pub fn set_event(env: &Env, event_id: u64, event: &Event) {
    let key = (EVENT_PREFIX, event_id);
    env.storage().persistent().set(&key, event);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

/// Get event data
pub fn get_event(env: &Env, event_id: u64) -> Result<Event, LumentixError> {
    let key = (EVENT_PREFIX, event_id);
    let event = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(LumentixError::EventNotFound)?;
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    Ok(event)
}

/// Set ticket data
pub fn set_ticket(env: &Env, ticket_id: u64, ticket: &Ticket) {
    let key = (TICKET_PREFIX, ticket_id);
    env.storage().persistent().set(&key, ticket);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

/// Get ticket data
pub fn get_ticket(env: &Env, ticket_id: u64) -> Result<Ticket, LumentixError> {
    let key = (TICKET_PREFIX, ticket_id);
    let ticket = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(LumentixError::TicketNotFound)?;
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    Ok(ticket)
}

/// Add amount to escrow for an event
pub fn add_escrow(env: &Env, event_id: u64, amount: i128) {
    let key = (ESCROW_PREFIX, event_id);
    let current: i128 = env.storage().persistent().get(&key).unwrap_or(0);
    env.storage().persistent().set(&key, &(current + amount));
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

/// Get escrow balance for an event
pub fn get_escrow(env: &Env, event_id: u64) -> Result<i128, LumentixError> {
    let key = (ESCROW_PREFIX, event_id);
    let bal: i128 = env.storage().persistent().get(&key).unwrap_or(0);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    Ok(bal)
}

/// Deduct amount from escrow
pub fn deduct_escrow(env: &Env, event_id: u64, amount: i128) -> Result<(), LumentixError> {
    let key = (ESCROW_PREFIX, event_id);
    let current: i128 = env.storage().persistent().get(&key).unwrap_or(0);

    if current < amount {
        return Err(LumentixError::InsufficientEscrow);
    }

    env.storage().persistent().set(&key, &(current - amount));
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    Ok(())
}

/// Clear escrow for an event
pub fn clear_escrow(env: &Env, event_id: u64) {
    let key = (ESCROW_PREFIX, event_id);
    env.storage().persistent().set(&key, &0i128);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

/// Set platform fee in basis points (e.g., 250 = 2.5%)
pub fn set_platform_fee_bps(env: &Env, fee_bps: u32) {
    env.storage().instance().set(&PLATFORM_FEE_BPS, &fee_bps);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
}

/// Get platform fee in basis points
pub fn get_platform_fee_bps(env: &Env) -> u32 {
    let fee = env.storage().instance().get(&PLATFORM_FEE_BPS).unwrap_or(0);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
    fee
}

/// Add amount to platform balance
pub fn add_platform_balance(env: &Env, amount: i128) {
    let current: i128 = env.storage().instance().get(&PLATFORM_BALANCE).unwrap_or(0);
    env.storage()
        .instance()
        .set(&PLATFORM_BALANCE, &(current + amount));
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
}

/// Get platform balance
pub fn get_platform_balance(env: &Env) -> i128 {
    let bal = env.storage().instance().get(&PLATFORM_BALANCE).unwrap_or(0);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
    bal
}

/// Clear platform balance (after withdrawal)
pub fn clear_platform_balance(env: &Env) {
    env.storage().instance().set(&PLATFORM_BALANCE, &0i128);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
}
