use crate::error::LumentixError;
use crate::types::{
    AccessibilityBooking, AccessibilityInventory, CurrencyConfig, Event, EventReview,
    InsurancePool, InsurancePolicy, OrganizerReputation, Seat, Ticket, TicketTransferRecord,
    VenueLayout, VipTier, WaitlistOffer, INSTANCE_LIFETIME, PERSISTENT_LIFETIME,
};
use soroban_sdk::{Address, Env, String, Vec};

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
const TRANSFER_HISTORY_PREFIX: &str = "TXHIST_";
const VIP_TIER_PREFIX: &str = "VIP_";
const ACCESSIBILITY_INV_PREFIX: &str = "ACCINV_";
const ACCESSIBILITY_BOOKING_PREFIX: &str = "ACCBOOK_";
const VENUE_LAYOUT_PREFIX: &str = "VENUE_";
const SEAT_PREFIX: &str = "SEAT_";
const CURRENCY_CONFIG_PREFIX: &str = "CURCFG_";
const ACC_BOOKING_COUNTER: &str = "ACC_CTR";
const WAITLIST_QUEUE_PREFIX: &str = "WQUEUE_";
const WAITLIST_OFFER_PREFIX: &str = "WOFFER_";
const WAITLIST_OFFER_RECIPIENTS_PREFIX: &str = "WOFRECS_";
const WAITLIST_RESERVED_PREFIX: &str = "WRESV_";
const INSURANCE_POLICY_PREFIX: &str = "INSPOL_";
const INSURANCE_POLICY_ID_COUNTER: &str = "INSPOL_CTR";
const INSURANCE_POOL: &str = "INSPOOL";
const REVIEW_PREFIX: &str = "REVIEW_";
const REVIEW_ID_COUNTER: &str = "REVIEW_CTR";
const REVIEWER_EVENT_PREFIX: &str = "REVEVT_";
const ORGANIZER_REPUTATION_PREFIX: &str = "ORGREP_";

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

/// Get token address as a Result
pub fn get_token_result(env: &Env) -> Result<Address, LumentixError> {
    env.storage()
        .instance()
        .get(&TOKEN)
        .ok_or(LumentixError::NotInitialized)
}

/// Get token address (panics if not set)
pub fn get_token(env: &Env) -> Address {
    let token: Address = get_token_result(env).unwrap();
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
    if env.storage().persistent().has(&key) {
        let bal: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
        Ok(bal)
    } else {
        Ok(0)
    }
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

/// Append a transfer record to a ticket's transfer history
pub fn append_ticket_transfer_history(env: &Env, ticket_id: u64, record: TicketTransferRecord) {
    let key = (TRANSFER_HISTORY_PREFIX, ticket_id);
    let mut history: Vec<TicketTransferRecord> = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| Vec::new(env));
    history.push_back(record);
    env.storage().persistent().set(&key, &history);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

/// Get the full transfer history for a ticket
pub fn get_ticket_transfer_history(
    env: &Env,
    ticket_id: u64,
) -> Vec<TicketTransferRecord> {
    let key = (TRANSFER_HISTORY_PREFIX, ticket_id);
    let history: Vec<TicketTransferRecord> = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| Vec::new(env));
    if env.storage().persistent().has(&key) {
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    }
    history
}

// ═══════════════════════════════════════════════════════════════════════════
// VIP TIER STORAGE
// ═══════════════════════════════════════════════════════════════════════════

pub fn set_vip_tier(env: &Env, event_id: u64, tier_name: &String, tier: &VipTier) {
    let key = (VIP_TIER_PREFIX, event_id, tier_name.clone());
    env.storage().persistent().set(&key, tier);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

pub fn get_vip_tier(env: &Env, event_id: u64, tier_name: &String) -> Result<VipTier, LumentixError> {
    let key = (VIP_TIER_PREFIX, event_id, tier_name.clone());
    let tier = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(LumentixError::VipTierNotFound)?;
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    Ok(tier)
}

pub fn has_vip_tier(env: &Env, event_id: u64, tier_name: &String) -> bool {
    let key = (VIP_TIER_PREFIX, event_id, tier_name.clone());
    env.storage().persistent().has(&key)
}

// ═══════════════════════════════════════════════════════════════════════════
// ACCESSIBILITY STORAGE
// ═══════════════════════════════════════════════════════════════════════════

pub fn set_accessibility_inventory(env: &Env, event_id: u64, inv: &AccessibilityInventory) {
    let key = (ACCESSIBILITY_INV_PREFIX, event_id);
    env.storage().persistent().set(&key, inv);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

pub fn get_accessibility_inventory(env: &Env, event_id: u64) -> Result<AccessibilityInventory, LumentixError> {
    let key = (ACCESSIBILITY_INV_PREFIX, event_id);
    let inv = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(LumentixError::AccessibilityNotConfigured)?;
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    Ok(inv)
}

pub fn get_next_accessibility_booking_id(env: &Env) -> u64 {
    let id = env.storage().instance().get(&ACC_BOOKING_COUNTER).unwrap_or(1);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
    id
}

pub fn increment_accessibility_booking_id(env: &Env) {
    let next_id = get_next_accessibility_booking_id(env) + 1;
    env.storage().instance().set(&ACC_BOOKING_COUNTER, &next_id);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
}

pub fn set_accessibility_booking(env: &Env, booking_id: u64, booking: &AccessibilityBooking) {
    let key = (ACCESSIBILITY_BOOKING_PREFIX, booking_id);
    env.storage().persistent().set(&key, booking);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

pub fn get_accessibility_booking(env: &Env, booking_id: u64) -> Result<AccessibilityBooking, LumentixError> {
    let key = (ACCESSIBILITY_BOOKING_PREFIX, booking_id);
    let booking = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(LumentixError::AccessibilityBookingNotFound)?;
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    Ok(booking)
}

// ═══════════════════════════════════════════════════════════════════════════
// VENUE LAYOUT / SEAT STORAGE
// ═══════════════════════════════════════════════════════════════════════════

pub fn set_venue_layout(env: &Env, event_id: u64, layout: &VenueLayout) {
    let key = (VENUE_LAYOUT_PREFIX, event_id);
    env.storage().persistent().set(&key, layout);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

pub fn get_venue_layout(env: &Env, event_id: u64) -> Result<VenueLayout, LumentixError> {
    let key = (VENUE_LAYOUT_PREFIX, event_id);
    let layout = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(LumentixError::VenueLayoutNotFound)?;
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    Ok(layout)
}

pub fn set_seat(env: &Env, event_id: u64, seat_id: &String, seat: &Seat) {
    let key = (SEAT_PREFIX, event_id, seat_id.clone());
    env.storage().persistent().set(&key, seat);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

pub fn get_seat(env: &Env, event_id: u64, seat_id: &String) -> Result<Seat, LumentixError> {
    let key = (SEAT_PREFIX, event_id, seat_id.clone());
    let seat = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(LumentixError::SeatNotFound)?;
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    Ok(seat)
}

// ═══════════════════════════════════════════════════════════════════════════
// CURRENCY CONFIG STORAGE
// ═══════════════════════════════════════════════════════════════════════════

pub fn set_currency_config(env: &Env, code: &String, config: &CurrencyConfig) {
    let key = (CURRENCY_CONFIG_PREFIX, code.clone());
    env.storage().instance().set(&key, config);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
}

pub fn get_currency_config(env: &Env, code: &String) -> Result<CurrencyConfig, LumentixError> {
    let key = (CURRENCY_CONFIG_PREFIX, code.clone());
    let config = env
        .storage()
        .instance()
        .get(&key)
        .ok_or(LumentixError::UnsupportedCurrency)?;
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
    Ok(config)
}

pub fn has_currency(env: &Env, code: &String) -> bool {
    let key = (CURRENCY_CONFIG_PREFIX, code.clone());
    env.storage().instance().has(&key)
}

// ═══════════════════════════════════════════════════════════════════════════
// WAITLIST STORAGE
// ═══════════════════════════════════════════════════════════════════════════

pub fn get_waitlist_queue(env: &Env, event_id: u64) -> Vec<Address> {
    let key = (WAITLIST_QUEUE_PREFIX, event_id);
    let queue: Vec<Address> = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| Vec::new(env));
    if env.storage().persistent().has(&key) {
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    }
    queue
}

pub fn set_waitlist_queue(env: &Env, event_id: u64, queue: &Vec<Address>) {
    let key = (WAITLIST_QUEUE_PREFIX, event_id);
    env.storage().persistent().set(&key, queue);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

pub fn get_waitlist_offer(env: &Env, event_id: u64, buyer: &Address) -> Option<WaitlistOffer> {
    let key = (WAITLIST_OFFER_PREFIX, event_id, buyer.clone());
    let offer: Option<WaitlistOffer> = env.storage().persistent().get(&key);
    if offer.is_some() {
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    }
    offer
}

pub fn set_waitlist_offer(env: &Env, event_id: u64, buyer: &Address, offer: &WaitlistOffer) {
    let key = (WAITLIST_OFFER_PREFIX, event_id, buyer.clone());
    env.storage().persistent().set(&key, offer);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

pub fn remove_waitlist_offer(env: &Env, event_id: u64, buyer: &Address) {
    let key = (WAITLIST_OFFER_PREFIX, event_id, buyer.clone());
    env.storage().persistent().remove(&key);
}

pub fn get_waitlist_offer_recipients(env: &Env, event_id: u64) -> Vec<Address> {
    let key = (WAITLIST_OFFER_RECIPIENTS_PREFIX, event_id);
    let recipients: Vec<Address> = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| Vec::new(env));
    if env.storage().persistent().has(&key) {
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    }
    recipients
}

pub fn set_waitlist_offer_recipients(env: &Env, event_id: u64, recipients: &Vec<Address>) {
    let key = (WAITLIST_OFFER_RECIPIENTS_PREFIX, event_id);
    env.storage().persistent().set(&key, recipients);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

pub fn get_waitlist_reserved(env: &Env, event_id: u64) -> u32 {
    let key = (WAITLIST_RESERVED_PREFIX, event_id);
    let reserved: u32 = env.storage().persistent().get(&key).unwrap_or(0);
    if env.storage().persistent().has(&key) {
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    }
    reserved
}

pub fn set_waitlist_reserved(env: &Env, event_id: u64, reserved: u32) {
    let key = (WAITLIST_RESERVED_PREFIX, event_id);
    env.storage().persistent().set(&key, &reserved);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

// ═══════════════════════════════════════════════════════════════════════════
// INSURANCE STORAGE
// ═══════════════════════════════════════════════════════════════════════════

/// Get next insurance policy ID
pub fn get_next_insurance_policy_id(env: &Env) -> u64 {
    let id = env.storage().instance().get(&INSURANCE_POLICY_ID_COUNTER).unwrap_or(1);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
    id
}

/// Increment insurance policy ID counter
pub fn increment_insurance_policy_id(env: &Env) {
    let next_id = get_next_insurance_policy_id(env) + 1;
    env.storage()
        .instance()
        .set(&INSURANCE_POLICY_ID_COUNTER, &next_id);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
}

/// Set insurance policy
pub fn set_insurance_policy(env: &Env, policy_id: u64, policy: &InsurancePolicy) {
    let key = (INSURANCE_POLICY_PREFIX, policy_id);
    env.storage().persistent().set(&key, policy);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

/// Get insurance policy
pub fn get_insurance_policy(
    env: &Env,
    policy_id: u64,
) -> Result<InsurancePolicy, LumentixError> {
    let key = (INSURANCE_POLICY_PREFIX, policy_id);
    let policy = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(LumentixError::InsurancePolicyNotFound)?;
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    Ok(policy)
}

/// Get insurance policy by ticket ID
pub fn get_insurance_policy_by_ticket(
    env: &Env,
    ticket_id: u64,
) -> Result<InsurancePolicy, LumentixError> {
    // Note: In a production system, you'd want a more efficient lookup
    // For now, we'll iterate through policies (this is simplified)
    let policy_id = get_next_insurance_policy_id(env);
    for i in 1..policy_id {
        let key = (INSURANCE_POLICY_PREFIX, i);
        if let Some(policy) = env.storage().persistent().get::<(u64, u64), InsurancePolicy>(&key) {
            if policy.ticket_id == ticket_id {
                env.storage()
                    .persistent()
                    .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
                return Ok(policy);
            }
        }
    }
    Err(LumentixError::InsurancePolicyNotFound)
}

/// Get insurance pool
pub fn get_insurance_pool(env: &Env) -> InsurancePool {
    let pool: InsurancePool = env
        .storage()
        .instance()
        .get(&INSURANCE_POOL)
        .unwrap_or(InsurancePool {
            total_balance: 0,
            total_policies: 0,
            total_claims_paid: 0,
        });
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
    pool
}

/// Set insurance pool
pub fn set_insurance_pool(env: &Env, pool: &InsurancePool) {
    env.storage().instance().set(&INSURANCE_POOL, pool);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
}

/// Add to insurance pool balance
pub fn add_to_insurance_pool(env: &Env, amount: i128) {
    let mut pool = get_insurance_pool(env);
    pool.total_balance += amount;
    set_insurance_pool(env, &pool);
}

/// Deduct from insurance pool balance
pub fn deduct_from_insurance_pool(env: &Env, amount: i128) -> Result<(), LumentixError> {
    let mut pool = get_insurance_pool(env);
    if pool.total_balance < amount {
        return Err(LumentixError::InsufficientInsurancePool);
    }
    pool.total_balance -= amount;
    pool.total_claims_paid += amount;
    set_insurance_pool(env, &pool);
    Ok(())
}

/// Increment total policies count in insurance pool
pub fn increment_total_policies(env: &Env) {
    let mut pool = get_insurance_pool(env);
    pool.total_policies += 1;
    set_insurance_pool(env, &pool);
}

// ═══════════════════════════════════════════════════════════════════════════
// REVIEW & REPUTATION STORAGE
// ═══════════════════════════════════════════════════════════════════════════

/// Get next review ID
pub fn get_next_review_id(env: &Env) -> u64 {
    let id = env
        .storage()
        .instance()
        .get(&REVIEW_ID_COUNTER)
        .unwrap_or(1u64);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
    id
}

/// Increment review ID counter
pub fn increment_review_id(env: &Env) {
    let next_id = get_next_review_id(env) + 1;
    env.storage().instance().set(&REVIEW_ID_COUNTER, &next_id);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
}

/// Persist a review
pub fn set_review(env: &Env, review_id: u64, review: &EventReview) {
    let key = (REVIEW_PREFIX, review_id);
    env.storage().persistent().set(&key, review);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

/// Fetch a review by ID
pub fn get_review(env: &Env, review_id: u64) -> Result<EventReview, LumentixError> {
    let key = (REVIEW_PREFIX, review_id);
    let review = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(LumentixError::ReviewNotFound)?;
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    Ok(review)
}

/// Record that a reviewer has already reviewed an event (duplicate guard).
/// Key: (reviewer, event_id) → review_id
pub fn set_reviewer_event(env: &Env, reviewer: &Address, event_id: u64, review_id: u64) {
    let key = (REVIEWER_EVENT_PREFIX, reviewer.clone(), event_id);
    env.storage().persistent().set(&key, &review_id);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

/// Check whether a reviewer has already reviewed an event
pub fn has_reviewer_reviewed(env: &Env, reviewer: &Address, event_id: u64) -> bool {
    let key = (REVIEWER_EVENT_PREFIX, reviewer.clone(), event_id);
    env.storage().persistent().has(&key)
}

/// Persist an organizer's reputation record
pub fn set_organizer_reputation(env: &Env, organizer: &Address, rep: &OrganizerReputation) {
    let key = (ORGANIZER_REPUTATION_PREFIX, organizer.clone());
    env.storage().persistent().set(&key, rep);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

/// Fetch an organizer's reputation record
pub fn get_organizer_reputation(
    env: &Env,
    organizer: &Address,
) -> OrganizerReputation {
    let key = (ORGANIZER_REPUTATION_PREFIX, organizer.clone());
    let rep: OrganizerReputation = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or(OrganizerReputation {
            organizer: organizer.clone(),
            reputation_score: 0,
            average_rating_x100: 0,
            total_reviews: 0,
            total_ratings_sum: 0,
        });
    if env.storage().persistent().has(&key) {
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    }
    rep
}
