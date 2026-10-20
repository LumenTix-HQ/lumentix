//! Automatic currency conversion at checkout (Issue #1500).
//!
//! An event prices its tickets in its own currency (`Event::currency`), which
//! is also the currency the organizer is settled in. A buyer can instead
//! choose to pay in any other registered currency. This module turns the
//! oracle price feeds registered through `set_currency_oracle` into the three
//! steps checkout needs:
//!
//! * [`fetch_live_exchange_rate`] reads the current rate between two
//!   currencies and refuses to quote from a stale feed.
//! * [`lock_exchange_rate`] pins a rate for a short window so the amount the
//!   buyer was shown cannot move while they confirm.
//! * [`convert_checkout_currency`] prices a checkout in the buyer's currency,
//!   consuming the lock when one is supplied, and returns the settlement
//!   amount the organizer receives.
//!
//! Rates are fixed-point with [`RATE_SCALE`] decimals of precision and
//! express "units of `to` per one unit of `from`", following the same
//! price-ratio convention as `convert_price`.

use crate::error::LumentixError;
use crate::events::{CheckoutCurrencyConverted, ExchangeRateLocked};
use crate::storage;
use crate::types::PERSISTENT_LIFETIME;
use soroban_sdk::{Address, Env, String, Symbol};

/// Fixed-point scale of a stored exchange rate (7 decimals).
pub const RATE_SCALE: i128 = 10_000_000;

/// How long a locked rate stays redeemable, in seconds.
pub const RATE_LOCK_DURATION: u64 = 300;

/// Oldest oracle price, in seconds, that may still back a quote.
pub const MAX_RATE_AGE: u64 = 3_600;

/// A live exchange rate between two registered currencies.
#[derive(Clone, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub struct ExchangeRate {
    pub from_currency: String,
    pub to_currency: String,
    /// Units of `to_currency` per one unit of `from_currency`, scaled by
    /// [`RATE_SCALE`].
    pub rate: i128,
    /// Ledger timestamp the rate was read at.
    pub fetched_at: u64,
}

/// A rate pinned for one buyer's checkout.
#[derive(Clone, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub struct RateLock {
    pub lock_id: u64,
    pub event_id: u64,
    pub buyer: Address,
    /// The event's currency, in which the organizer is settled.
    pub settlement_currency: String,
    /// The currency the buyer chose to pay in.
    pub buyer_currency: String,
    /// Units of `buyer_currency` per one unit of `settlement_currency`, scaled
    /// by [`RATE_SCALE`].
    pub rate: i128,
    pub locked_at: u64,
    pub expires_at: u64,
    pub consumed: bool,
}

/// The outcome of pricing a checkout in the buyer's currency.
#[derive(Clone, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub struct CheckoutConversion {
    pub event_id: u64,
    pub buyer: Address,
    pub settlement_currency: String,
    pub buyer_currency: String,
    /// Amount the organizer receives, in the settlement currency.
    pub settlement_amount: i128,
    /// Amount the buyer pays, in their own currency.
    pub buyer_amount: i128,
    /// Rate applied, scaled by [`RATE_SCALE`].
    pub rate: i128,
    /// The lock that fixed the rate, or 0 when the live rate was used.
    pub lock_id: u64,
    pub converted_at: u64,
}

// ──────────────────────────── Storage keys ──────────────────────────────────

/// key: (Symbol("fx_lock"), lock_id: u64)
fn lock_key(env: &Env, lock_id: u64) -> (Symbol, u64) {
    (Symbol::new(env, "fx_lock"), lock_id)
}

/// key: Symbol("fx_lock_ctr")
fn lock_counter_key(env: &Env) -> Symbol {
    Symbol::new(env, "fx_lock_ctr")
}

fn store_lock(env: &Env, lock: &RateLock) {
    let key = lock_key(env, lock.lock_id);
    env.storage().persistent().set(&key, lock);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

fn next_lock_id(env: &Env) -> u64 {
    let key = lock_counter_key(env);
    let next: u64 = env
        .storage()
        .persistent()
        .get::<Symbol, u64>(&key)
        .unwrap_or(0)
        .saturating_add(1);
    env.storage().persistent().set(&key, &next);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    next
}

/// Return the rate lock with `lock_id`.
///
/// Fails with `ExchangeRateLockNotFound` when it does not exist.
pub fn get_rate_lock(env: &Env, lock_id: u64) -> Result<RateLock, LumentixError> {
    env.storage()
        .persistent()
        .get(&lock_key(env, lock_id))
        .ok_or(LumentixError::ExchangeRateLockNotFound)
}

// ──────────────────────────── Helpers ───────────────────────────────────────

/// `amount * rate / RATE_SCALE`, rounded up so the buyer is never charged less
/// than the settlement amount is worth.
fn apply_rate_round_up(amount: i128, rate: i128) -> Result<i128, LumentixError> {
    let product = amount
        .checked_mul(rate)
        .ok_or(LumentixError::CurrencyConversionError)?;
    let converted = product / RATE_SCALE + if product % RATE_SCALE != 0 { 1 } else { 0 };
    if converted <= 0 {
        return Err(LumentixError::CurrencyConversionError);
    }
    Ok(converted)
}

// ──────────────────────────── Public interface ───────────────────────────────

/// Read the current rate from `from_currency` to `to_currency`.
///
/// Both currencies must be registered with an oracle price, and neither price
/// may be older than [`MAX_RATE_AGE`]. Converting a currency to itself is
/// always exactly [`RATE_SCALE`].
///
/// Fails with `UnsupportedCurrency` for an unregistered currency,
/// `OraclePriceNotFound` for a non-positive price, `StaleExchangeRate` when a
/// feed is too old, and `CurrencyConversionError` when the rate rounds to zero.
pub fn fetch_live_exchange_rate(
    env: &Env,
    from_currency: &String,
    to_currency: &String,
) -> Result<ExchangeRate, LumentixError> {
    let now = env.ledger().timestamp();

    if from_currency == to_currency {
        // Still reject a currency nobody registered.
        storage::get_currency_config(env, from_currency)?;
        return Ok(ExchangeRate {
            from_currency: from_currency.clone(),
            to_currency: to_currency.clone(),
            rate: RATE_SCALE,
            fetched_at: now,
        });
    }

    let from = storage::get_currency_config(env, from_currency)?;
    let to = storage::get_currency_config(env, to_currency)?;

    if from.oracle_price <= 0 || to.oracle_price <= 0 {
        return Err(LumentixError::OraclePriceNotFound);
    }

    if now.saturating_sub(from.last_updated) > MAX_RATE_AGE
        || now.saturating_sub(to.last_updated) > MAX_RATE_AGE
    {
        return Err(LumentixError::StaleExchangeRate);
    }

    let rate = from
        .oracle_price
        .checked_mul(RATE_SCALE)
        .ok_or(LumentixError::CurrencyConversionError)?
        / to.oracle_price;
    if rate <= 0 {
        return Err(LumentixError::CurrencyConversionError);
    }

    Ok(ExchangeRate {
        from_currency: from_currency.clone(),
        to_currency: to_currency.clone(),
        rate,
        fetched_at: now,
    })
}

/// Pin the current rate between the event's currency and the buyer's currency
/// for [`RATE_LOCK_DURATION`] seconds.
///
/// The lock belongs to `buyer` and can be redeemed once, by
/// [`convert_checkout_currency`] for the same event and currency. Returns the
/// stored lock.
pub fn lock_exchange_rate(
    env: &Env,
    buyer: &Address,
    event_id: u64,
    settlement_currency: &String,
    buyer_currency: &String,
) -> Result<RateLock, LumentixError> {
    let quote = fetch_live_exchange_rate(env, settlement_currency, buyer_currency)?;
    let now = env.ledger().timestamp();

    let lock = RateLock {
        lock_id: next_lock_id(env),
        event_id,
        buyer: buyer.clone(),
        settlement_currency: settlement_currency.clone(),
        buyer_currency: buyer_currency.clone(),
        rate: quote.rate,
        locked_at: now,
        expires_at: now.saturating_add(RATE_LOCK_DURATION),
        consumed: false,
    };

    store_lock(env, &lock);
    ExchangeRateLocked::emit(
        env,
        lock.lock_id,
        event_id,
        buyer.clone(),
        buyer_currency.clone(),
        lock.rate,
        lock.expires_at,
    );

    Ok(lock)
}

/// Price a checkout of `settlement_amount` (in the event's currency) in the
/// buyer's currency.
///
/// With a `lock_id` the locked rate is used and the lock is spent; without
/// one the live rate is fetched. Returns the amount the buyer pays alongside
/// the amount the organizer is settled.
///
/// Fails with `InvalidAmount` for a non-positive settlement amount,
/// `ExchangeRateLockNotFound` when the lock is unknown or was made for a
/// different event or currency, `Unauthorized` when it belongs to another
/// buyer, `ExchangeRateLockConsumed` when it was already spent, and
/// `ExchangeRateLockExpired` once its window has passed.
pub fn convert_checkout_currency(
    env: &Env,
    buyer: &Address,
    event_id: u64,
    settlement_currency: &String,
    buyer_currency: &String,
    settlement_amount: i128,
    lock_id: Option<u64>,
) -> Result<CheckoutConversion, LumentixError> {
    if settlement_amount <= 0 {
        return Err(LumentixError::InvalidAmount);
    }

    let now = env.ledger().timestamp();

    let (rate, applied_lock_id) = match lock_id {
        Some(id) => {
            let mut lock = get_rate_lock(env, id)?;
            if lock.buyer != *buyer {
                return Err(LumentixError::Unauthorized);
            }
            if lock.event_id != event_id
                || lock.settlement_currency != *settlement_currency
                || lock.buyer_currency != *buyer_currency
            {
                return Err(LumentixError::ExchangeRateLockNotFound);
            }
            if lock.consumed {
                return Err(LumentixError::ExchangeRateLockConsumed);
            }
            if now > lock.expires_at {
                return Err(LumentixError::ExchangeRateLockExpired);
            }
            lock.consumed = true;
            store_lock(env, &lock);
            (lock.rate, id)
        }
        None => (
            fetch_live_exchange_rate(env, settlement_currency, buyer_currency)?.rate,
            0,
        ),
    };

    let buyer_amount = apply_rate_round_up(settlement_amount, rate)?;

    let conversion = CheckoutConversion {
        event_id,
        buyer: buyer.clone(),
        settlement_currency: settlement_currency.clone(),
        buyer_currency: buyer_currency.clone(),
        settlement_amount,
        buyer_amount,
        rate,
        lock_id: applied_lock_id,
        converted_at: now,
    };

    CheckoutCurrencyConverted::emit(
        env,
        event_id,
        buyer.clone(),
        buyer_currency.clone(),
        buyer_amount,
        settlement_amount,
    );

    Ok(conversion)
}
