// contract/src/replay_protection.rs

use soroban_sdk::{contracttype, symbol_short, Address, Env, String, Symbol};

use crate::error::LumentixError;
use crate::validation;

/// Storage key for an account's current transaction nonce.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ReplayDataKey {
    /// Tracks the last consumed nonce for an account.
    Nonce(Address),
    /// Tracks whether a given idempotency key has been consumed by an account.
    IdempotencyKey(Address, String),
}

/// Event symbol emitted when a replay attempt is rejected.
const REPLAY_REJECTED: Symbol = symbol_short!("replay_rej");

/// Returns the current stored nonce for `account` (0 if none has been set).
fn read_nonce(env: &Env, account: &Address) -> u64 {
    env.storage()
        .persistent()
        .get(&ReplayDataKey::Nonce(account.clone()))
        .unwrap_or(0u64)
}

/// Persists `nonce` as the latest consumed nonce for `account`.
fn write_nonce(env: &Env, account: &Address, nonce: u64) {
    env.storage()
        .persistent()
        .set(&ReplayDataKey::Nonce(account.clone()), &nonce);
}

/// Returns whether `key` has already been consumed by `account`.
fn is_key_consumed(env: &Env, account: &Address, key: &String) -> bool {
    env.storage()
        .persistent()
        .get(&ReplayDataKey::IdempotencyKey(account.clone(), key.clone()))
        .unwrap_or(false)
}

/// Marks `key` as consumed for `account`.
fn mark_key_consumed(env: &Env, account: &Address, key: &String) {
    env.storage().persistent().set(
        &ReplayDataKey::IdempotencyKey(account.clone(), key.clone()),
        &true,
    );
}

/// Emits a replay-rejection event for observability.
fn emit_replay_rejected(env: &Env, account: &Address, nonce: u64, key: &String) {
    env.events()
        .publish((REPLAY_REJECTED, account.clone()), (nonce, key.clone()));
}

/// Generates the next transaction nonce for `account`.
///
/// Reads the current nonce, increments it, persists the new value, and
/// returns the new nonce. This is the nonce the caller should attach to the
/// transaction they are about to submit.
pub fn generate_transaction_nonce(env: &Env, account: &Address) -> u64 {
    let current = read_nonce(env, account);
    let next = current.saturating_add(1);
    write_nonce(env, account, next);
    next
}

/// Validates an idempotency key for `account`.
///
/// Performs a format check via `validation::validate_idempotency_key_format`
/// and rejects keys that have already been consumed with
/// `LumentixError::ReplayAttempt`.
pub fn validate_idempotency_key(
    env: &Env,
    account: &Address,
    key: &String,
) -> Result<(), LumentixError> {
    validation::validate_idempotency_key_format(key)?;

    if is_key_consumed(env, account, key) {
        emit_replay_rejected(env, account, read_nonce(env, account), key);
        return Err(LumentixError::ReplayAttempt);
    }

    Ok(())
}

/// Rejects a replay attempt and, on success, records the transaction.
///
/// Verifies that `nonce` is strictly greater than the stored nonce and that
/// `key` has not already been consumed. On success it persists the new nonce
/// and marks the key consumed. On failure it emits a replay-rejection event
/// and returns `LumentixError::ReplayAttempt`.
pub fn reject_replay_attempt(
    env: &Env,
    account: &Address,
    nonce: u64,
    key: &String,
) -> Result<(), LumentixError> {
    let stored_nonce = read_nonce(env, account);

    if nonce <= stored_nonce {
        emit_replay_rejected(env, account, nonce, key);
        return Err(LumentixError::ReplayAttempt);
    }

    if is_key_consumed(env, account, key) {
        emit_replay_rejected(env, account, nonce, key);
        return Err(LumentixError::ReplayAttempt);
    }

    write_nonce(env, account, nonce);
    mark_key_consumed(env, account, key);

    Ok(())
}

/// Consumes an idempotency key for `account`, used by purchase/transfer paths.
///
/// Validates the key (format + not already consumed) and then marks it as
/// consumed. Returns `LumentixError::ReplayAttempt` if the key was already
/// used or is malformed.
pub fn consume_idempotency_key(
    env: &Env,
    account: &Address,
    key: &String,
) -> Result<(), LumentixError> {
    validate_idempotency_key(env, account, key)?;
    mark_key_consumed(env, account, key);
    Ok(())
}