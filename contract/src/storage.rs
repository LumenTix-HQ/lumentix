use crate::error::LumentixError;
use crate::types::{
    AccessibilityBooking, AccessibilityInventory, BridgeTransaction, CarbonFootprint,
    CarbonOffsetPurchase, CollectibleInventory, CrossChainTransfer, CurrencyConfig,
    EnvironmentalImpact, Event, EventMerchandise, EventReview, IdentityCredential,
    IdentityProvider, InsurancePolicy, InsurancePool, NftCollectible, OrganizerReputation, Seat,
    Ticket, TicketTransferRecord, UpgradeGovernanceConfig, UpgradeProposal, UpgradeVote,
    VenueLayout, VipTier, WaitlistOffer, INSTANCE_LIFETIME, PERSISTENT_LIFETIME,
    VenueSpaceAllocation, SubscriptionPlan, SubscriptionStatus, SecurityIncident, UserPreferences,
};
use soroban_sdk::{Address, BytesN, Env, String, Vec};

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
const VENUE_ALLOC_PREFIX: &str = "VENAL_";
const SUB_PLAN_PREFIX: &str = "SUBPL_";
const SUB_STATUS_PREFIX: &str = "SUBST_";
const PLAN_ID_COUNTER: &str = "PLAN_CTR";
const INCIDENT_PREFIX: &str = "INC_";
const INCIDENT_COUNTER: &str = "INC_CTR";
const USER_PREFS_PREFIX: &str = "UPREF_";

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
pub fn get_ticket_transfer_history(env: &Env, ticket_id: u64) -> Vec<TicketTransferRecord> {
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

pub fn get_vip_tier(
    env: &Env,
    event_id: u64,
    tier_name: &String,
) -> Result<VipTier, LumentixError> {
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

pub fn get_accessibility_inventory(
    env: &Env,
    event_id: u64,
) -> Result<AccessibilityInventory, LumentixError> {
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
    let id = env
        .storage()
        .instance()
        .get(&ACC_BOOKING_COUNTER)
        .unwrap_or(1);
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

pub fn get_accessibility_booking(
    env: &Env,
    booking_id: u64,
) -> Result<AccessibilityBooking, LumentixError> {
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
    let id = env
        .storage()
        .instance()
        .get(&INSURANCE_POLICY_ID_COUNTER)
        .unwrap_or(1);
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
pub fn get_insurance_policy(env: &Env, policy_id: u64) -> Result<InsurancePolicy, LumentixError> {
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
        if let Some(policy) = env
            .storage()
            .persistent()
            .get::<(&str, u64), InsurancePolicy>(&key)
        {
            if policy.ticket_id == ticket_id {
                env.storage().persistent().extend_ttl(
                    &key,
                    PERSISTENT_LIFETIME,
                    PERSISTENT_LIFETIME,
                );
                return Ok(policy);
            }
        }
    }
    Err(LumentixError::InsurancePolicyNotFound)
}

/// Get insurance pool
pub fn get_insurance_pool(env: &Env) -> InsurancePool {
    let pool: InsurancePool =
        env.storage()
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
pub fn get_organizer_reputation(env: &Env, organizer: &Address) -> OrganizerReputation {
    let key = (ORGANIZER_REPUTATION_PREFIX, organizer.clone());
    let rep: OrganizerReputation =
        env.storage()
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

// ═══════════════════════════════════════════════════════════════════════════
// UPGRADE MECHANISM STORAGE
// ═══════════════════════════════════════════════════════════════════════════

const UPGRADE_PROPOSAL_COUNTER: &str = "UPGRADE_CTR";
const UPGRADE_PROPOSAL_PREFIX: &str = "UPROP_";
const UPGRADE_VOTE_PREFIX: &str = "UVOTE_";
const UPGRADE_GOVERNANCE_CONFIG: &str = "UPGRADE_GOV";
const UPGRADE_PROPOSAL_HASH_PREFIX: &str = "UPROPHASH_";

pub fn get_next_upgrade_proposal_id(env: &Env) -> u64 {
    let id = env
        .storage()
        .instance()
        .get(&UPGRADE_PROPOSAL_COUNTER)
        .unwrap_or(1);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
    id
}

pub fn increment_upgrade_proposal_id(env: &Env) {
    let next_id = get_next_upgrade_proposal_id(env) + 1;
    env.storage()
        .instance()
        .set(&UPGRADE_PROPOSAL_COUNTER, &next_id);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
}

pub fn set_upgrade_proposal(env: &Env, proposal_id: u64, proposal: &UpgradeProposal) {
    let key = (UPGRADE_PROPOSAL_PREFIX, proposal_id);
    env.storage().persistent().set(&key, proposal);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

pub fn get_upgrade_proposal(env: &Env, proposal_id: u64) -> Result<UpgradeProposal, LumentixError> {
    let key = (UPGRADE_PROPOSAL_PREFIX, proposal_id);
    let proposal = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(LumentixError::UpgradeProposalNotFound)?;
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    Ok(proposal)
}

pub fn has_upgrade_proposal_by_hash(env: &Env, wasm_hash: &BytesN<32>) -> bool {
    let key = (UPGRADE_PROPOSAL_HASH_PREFIX, wasm_hash.clone());
    env.storage().persistent().has(&key)
}

pub fn set_upgrade_proposal_hash(env: &Env, wasm_hash: &BytesN<32>, proposal_id: u64) {
    let key = (UPGRADE_PROPOSAL_HASH_PREFIX, wasm_hash.clone());
    env.storage().persistent().set(&key, &proposal_id);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

pub fn set_upgrade_governance_config(env: &Env, config: &UpgradeGovernanceConfig) {
    env.storage()
        .instance()
        .set(&UPGRADE_GOVERNANCE_CONFIG, config);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
}

pub fn get_upgrade_governance_config(env: &Env) -> UpgradeGovernanceConfig {
    let config: UpgradeGovernanceConfig = env
        .storage()
        .instance()
        .get(&UPGRADE_GOVERNANCE_CONFIG)
        .unwrap_or(UpgradeGovernanceConfig {
            voting_period_seconds: 604800, // 7 days
            required_approval_percentage: 60,
            governance_members: Vec::new(env),
        });
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
    config
}

pub fn set_upgrade_vote(env: &Env, proposal_id: u64, voter: &Address, vote: &UpgradeVote) {
    let key = (UPGRADE_VOTE_PREFIX, proposal_id, voter.clone());
    env.storage().persistent().set(&key, vote);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

pub fn get_upgrade_vote(env: &Env, proposal_id: u64, voter: &Address) -> Option<UpgradeVote> {
    let key = (UPGRADE_VOTE_PREFIX, proposal_id, voter.clone());
    let vote: Option<UpgradeVote> = env.storage().persistent().get(&key);
    if vote.is_some() {
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    }
    vote
}

// ═══════════════════════════════════════════════════════════════════════════
// CARBON OFFSET STORAGE
// ═══════════════════════════════════════════════════════════════════════════

const CARBON_FOOTPRINT_PREFIX: &str = "CFOOT_";
const CARBON_OFFSET_PURCHASE_PREFIX: &str = "COFFSET_";
const CARBON_OFFSET_PURCHASE_COUNTER: &str = "COFFSET_CTR";
const ENVIRONMENTAL_IMPACT_PREFIX: &str = "ENVIMP_";

pub fn get_next_carbon_offset_purchase_id(env: &Env) -> u64 {
    let id = env
        .storage()
        .instance()
        .get(&CARBON_OFFSET_PURCHASE_COUNTER)
        .unwrap_or(1);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
    id
}

pub fn increment_carbon_offset_purchase_id(env: &Env) {
    let next_id = get_next_carbon_offset_purchase_id(env) + 1;
    env.storage()
        .instance()
        .set(&CARBON_OFFSET_PURCHASE_COUNTER, &next_id);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
}

pub fn set_carbon_footprint(env: &Env, event_id: u64, footprint: &CarbonFootprint) {
    let key = (CARBON_FOOTPRINT_PREFIX, event_id);
    env.storage().persistent().set(&key, footprint);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

pub fn get_carbon_footprint(env: &Env, event_id: u64) -> Option<CarbonFootprint> {
    let key = (CARBON_FOOTPRINT_PREFIX, event_id);
    let footprint: Option<CarbonFootprint> = env.storage().persistent().get(&key);
    if footprint.is_some() {
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    }
    footprint
}

pub fn set_carbon_offset_purchase(env: &Env, purchase_id: u64, purchase: &CarbonOffsetPurchase) {
    let key = (CARBON_OFFSET_PURCHASE_PREFIX, purchase_id);
    env.storage().persistent().set(&key, purchase);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

pub fn get_carbon_offset_purchase(
    env: &Env,
    purchase_id: u64,
) -> Result<CarbonOffsetPurchase, LumentixError> {
    let key = (CARBON_OFFSET_PURCHASE_PREFIX, purchase_id);
    let purchase = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(LumentixError::CarbonOffsetNotFound)?;
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    Ok(purchase)
}

pub fn set_environmental_impact(env: &Env, event_id: u64, impact: &EnvironmentalImpact) {
    let key = (ENVIRONMENTAL_IMPACT_PREFIX, event_id);
    env.storage().persistent().set(&key, impact);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

pub fn get_environmental_impact(env: &Env, event_id: u64) -> EnvironmentalImpact {
    let key = (ENVIRONMENTAL_IMPACT_PREFIX, event_id);
    let impact: EnvironmentalImpact =
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or(EnvironmentalImpact {
                event_id,
                total_footprint_kg: 0,
                total_offset_kg: 0,
                net_impact_kg: 0,
                total_purchases: 0,
                neutral_status: false,
            });
    if env.storage().persistent().has(&key) {
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    }
    impact
}

// ═══════════════════════════════════════════════════════════════════════════
// IDENTITY VERIFICATION STORAGE
// ═══════════════════════════════════════════════════════════════════════════

const IDENTITY_CREDENTIAL_PREFIX: &str = "IDCRED_";
const IDENTITY_CREDENTIAL_COUNTER: &str = "IDCRED_CTR";
const IDENTITY_CREDENTIAL_BY_SUBJECT_PREFIX: &str = "IDSUB_";
const IDENTITY_PROVIDER_PREFIX: &str = "IDPROV_";

pub fn get_next_identity_credential_id(env: &Env) -> u64 {
    let id = env
        .storage()
        .instance()
        .get(&IDENTITY_CREDENTIAL_COUNTER)
        .unwrap_or(1);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
    id
}

pub fn increment_identity_credential_id(env: &Env) {
    let next_id = get_next_identity_credential_id(env) + 1;
    env.storage()
        .instance()
        .set(&IDENTITY_CREDENTIAL_COUNTER, &next_id);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
}

pub fn set_identity_credential(env: &Env, credential_id: u64, credential: &IdentityCredential) {
    let key = (IDENTITY_CREDENTIAL_PREFIX, credential_id);
    env.storage().persistent().set(&key, credential);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

pub fn get_identity_credential(
    env: &Env,
    credential_id: u64,
) -> Result<IdentityCredential, LumentixError> {
    let key = (IDENTITY_CREDENTIAL_PREFIX, credential_id);
    let credential = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(LumentixError::IdentityCredentialNotFound)?;
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    Ok(credential)
}

pub fn set_identity_credential_by_subject(
    env: &Env,
    subject: &Address,
    provider: &IdentityProvider,
    credential_id: u64,
) {
    let key = (
        IDENTITY_CREDENTIAL_BY_SUBJECT_PREFIX,
        subject.clone(),
        provider.clone(),
    );
    env.storage().persistent().set(&key, &credential_id);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

pub fn get_identity_credential_by_subject(
    env: &Env,
    subject: &Address,
    provider: &IdentityProvider,
) -> Option<u64> {
    let key = (
        IDENTITY_CREDENTIAL_BY_SUBJECT_PREFIX,
        subject.clone(),
        provider.clone(),
    );
    let id: Option<u64> = env.storage().persistent().get(&key);
    if id.is_some() {
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    }
    id
}

pub fn register_identity_provider(env: &Env, provider: &IdentityProvider, supported: bool) {
    let key = (IDENTITY_PROVIDER_PREFIX, provider.clone());
    env.storage().instance().set(&key, &supported);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
}

pub fn is_identity_provider_supported(env: &Env, provider: &IdentityProvider) -> bool {
    let key = (IDENTITY_PROVIDER_PREFIX, provider.clone());
    env.storage().instance().get(&key).unwrap_or(false)
}

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-CHAIN TICKET PORTABILITY STORAGE
// ═══════════════════════════════════════════════════════════════════════════

const CROSS_CHAIN_TRANSFER_PREFIX: &str = "CCTRANS_";
const CROSS_CHAIN_TRANSFER_COUNTER: &str = "CCTRANS_CTR";
const BRIDGE_TRANSACTION_PREFIX: &str = "BRIDGETX_";
const BRIDGE_PAUSED_KEY: &str = "BRIDGE_PAUSED";
const SUPPORTED_CHAIN_PREFIX: &str = "SUPCHAIN_";

pub fn get_next_cross_chain_transfer_id(env: &Env) -> u64 {
    let id = env
        .storage()
        .instance()
        .get(&CROSS_CHAIN_TRANSFER_COUNTER)
        .unwrap_or(1);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
    id
}

pub fn increment_cross_chain_transfer_id(env: &Env) {
    let next_id = get_next_cross_chain_transfer_id(env) + 1;
    env.storage()
        .instance()
        .set(&CROSS_CHAIN_TRANSFER_COUNTER, &next_id);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
}

pub fn set_cross_chain_transfer(env: &Env, transfer_id: u64, transfer: &CrossChainTransfer) {
    let key = (CROSS_CHAIN_TRANSFER_PREFIX, transfer_id);
    env.storage().persistent().set(&key, transfer);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

pub fn get_cross_chain_transfer(
    env: &Env,
    transfer_id: u64,
) -> Result<CrossChainTransfer, LumentixError> {
    let key = (CROSS_CHAIN_TRANSFER_PREFIX, transfer_id);
    let transfer = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(LumentixError::CrossChainTransferNotFound)?;
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    Ok(transfer)
}

pub fn set_bridge_transaction(env: &Env, tx_hash: &String, tx: &BridgeTransaction) {
    let key = (BRIDGE_TRANSACTION_PREFIX, tx_hash.clone());
    env.storage().persistent().set(&key, tx);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

pub fn get_bridge_transaction(env: &Env, tx_hash: &String) -> Option<BridgeTransaction> {
    let key = (BRIDGE_TRANSACTION_PREFIX, tx_hash.clone());
    let tx: Option<BridgeTransaction> = env.storage().persistent().get(&key);
    if tx.is_some() {
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    }
    tx
}

pub fn set_bridge_paused(env: &Env, paused: bool) {
    env.storage().instance().set(&BRIDGE_PAUSED_KEY, &paused);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
}

pub fn is_bridge_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&BRIDGE_PAUSED_KEY)
        .unwrap_or(false)
}

pub fn register_supported_chain(env: &Env, chain: &String, supported: bool) {
    let key = (SUPPORTED_CHAIN_PREFIX, chain.clone());
    env.storage().instance().set(&key, &supported);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
}

pub fn is_chain_supported(env: &Env, chain: &String) -> bool {
    let key = (SUPPORTED_CHAIN_PREFIX, chain.clone());
    env.storage().instance().get(&key).unwrap_or(false)
}

// ═══════════════════════════════════════════════════════════════════════════
// MERCHANDISE & NFT COLLECTIBLE STORAGE
// ═══════════════════════════════════════════════════════════════════════════

const MERCHANDISE_PREFIX: &str = "MERCH_";
const MERCHANDISE_COUNTER: &str = "MERCH_CTR";
const NFT_PREFIX: &str = "NFT_";
const NFT_COUNTER: &str = "NFT_CTR";
const COLLECTIBLE_INVENTORY_PREFIX: &str = "COLINV_";

/// Get next merchandise ID
pub fn get_next_merchandise_id(env: &Env) -> u64 {
    let id = env
        .storage()
        .instance()
        .get(&MERCHANDISE_COUNTER)
        .unwrap_or(1);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
    id
}

/// Increment merchandise ID counter
pub fn increment_merchandise_id(env: &Env) {
    let next_id = get_next_merchandise_id(env) + 1;
    env.storage()
        .instance()
        .set(&MERCHANDISE_COUNTER, &next_id);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
}

/// Set merchandise item
pub fn set_merchandise(env: &Env, merchandise_id: u64, item: &EventMerchandise) {
    let key = (MERCHANDISE_PREFIX, merchandise_id);
    env.storage().persistent().set(&key, item);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

/// Get merchandise item
pub fn get_merchandise(
    env: &Env,
    merchandise_id: u64,
) -> Result<EventMerchandise, LumentixError> {
    let key = (MERCHANDISE_PREFIX, merchandise_id);
    let item = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(LumentixError::MerchandiseNotFound)?;
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    Ok(item)
}

/// Get next NFT ID
pub fn get_next_nft_id(env: &Env) -> u64 {
    let id = env
        .storage()
        .instance()
        .get(&NFT_COUNTER)
        .unwrap_or(1);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
    id
}

/// Increment NFT ID counter
pub fn increment_nft_id(env: &Env) {
    let next_id = get_next_nft_id(env) + 1;
    env.storage().instance().set(&NFT_COUNTER, &next_id);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
}

/// Set NFT collectible
pub fn set_nft(env: &Env, nft_id: u64, nft: &NftCollectible) {
    let key = (NFT_PREFIX, nft_id);
    env.storage().persistent().set(&key, nft);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

/// Get NFT collectible
pub fn get_nft(env: &Env, nft_id: u64) -> Result<NftCollectible, LumentixError> {
    let key = (NFT_PREFIX, nft_id);
    let nft = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(LumentixError::NftNotFound)?;
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    Ok(nft)
}

/// Set collectible inventory for an event
pub fn set_collectible_inventory(env: &Env, event_id: u64, inv: &CollectibleInventory) {
    let key = (COLLECTIBLE_INVENTORY_PREFIX, event_id);
    env.storage().persistent().set(&key, inv);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

/// Get collectible inventory for an event
pub fn get_collectible_inventory(
    env: &Env,
    event_id: u64,
) -> Result<CollectibleInventory, LumentixError> {
    let key = (COLLECTIBLE_INVENTORY_PREFIX, event_id);
    let inv = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(LumentixError::CollectibleInventoryNotFound)?;
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    Ok(inv)
}

/// Check if collectible inventory exists for an event
pub fn has_collectible_inventory(env: &Env, event_id: u64) -> bool {
    let key = (COLLECTIBLE_INVENTORY_PREFIX, event_id);
    env.storage().persistent().has(&key)
}

// ═══════════════════════════════════════════════════════════════════════════
// Dynamic Venue Space Allocation Storage Helpers
// ═══════════════════════════════════════════════════════════════════════════

pub fn set_venue_space_allocation(env: &Env, event_id: u64, venue_id: &String, space_id: &String, alloc: &VenueSpaceAllocation) {
    let key = (VENUE_ALLOC_PREFIX, event_id, venue_id.clone(), space_id.clone());
    env.storage().persistent().set(&key, alloc);
    env.storage().persistent().extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

pub fn get_venue_space_allocation(env: &Env, event_id: u64, venue_id: &String, space_id: &String) -> Result<VenueSpaceAllocation, LumentixError> {
    let key = (VENUE_ALLOC_PREFIX, event_id, venue_id.clone(), space_id.clone());
    let alloc = env.storage().persistent().get(&key).ok_or(LumentixError::VenueSpaceAllocationNotFound)?;
    env.storage().persistent().extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    Ok(alloc)
}

pub fn has_venue_space_allocation(env: &Env, event_id: u64, venue_id: &String, space_id: &String) -> bool {
    let key = (VENUE_ALLOC_PREFIX, event_id, venue_id.clone(), space_id.clone());
    env.storage().persistent().has(&key)
}

// ═══════════════════════════════════════════════════════════════════════════
// Subscription-Based Access Passes Storage Helpers
// ═══════════════════════════════════════════════════════════════════════════

pub fn get_next_plan_id(env: &Env) -> u64 {
    let id = env.storage().instance().get(&PLAN_ID_COUNTER).unwrap_or(1);
    env.storage().instance().extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
    id
}

pub fn increment_plan_id(env: &Env) {
    let next_id = get_next_plan_id(env) + 1;
    env.storage().instance().set(&PLAN_ID_COUNTER, &next_id);
    env.storage().instance().extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
}

pub fn set_subscription_plan(env: &Env, plan_id: u64, plan: &SubscriptionPlan) {
    let key = (SUB_PLAN_PREFIX, plan_id);
    env.storage().persistent().set(&key, plan);
    env.storage().persistent().extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

pub fn get_subscription_plan(env: &Env, plan_id: u64) -> Result<SubscriptionPlan, LumentixError> {
    let key = (SUB_PLAN_PREFIX, plan_id);
    let plan = env.storage().persistent().get(&key).ok_or(LumentixError::SubscriptionPlanNotFound)?;
    env.storage().persistent().extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    Ok(plan)
}

pub fn set_subscription_status(env: &Env, subscriber: &Address, plan_id: u64, status: &SubscriptionStatus) {
    let key = (SUB_STATUS_PREFIX, subscriber.clone(), plan_id);
    env.storage().persistent().set(&key, status);
    env.storage().persistent().extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

pub fn get_subscription_status(env: &Env, subscriber: &Address, plan_id: u64) -> Result<SubscriptionStatus, LumentixError> {
    let key = (SUB_STATUS_PREFIX, subscriber.clone(), plan_id);
    let status = env.storage().persistent().get(&key).ok_or(LumentixError::SubscriptionInactive)?;
    env.storage().persistent().extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    Ok(status)
}

// ═══════════════════════════════════════════════════════════════════════════
// Comprehensive Security Monitoring Storage Helpers
// ═══════════════════════════════════════════════════════════════════════════

pub fn get_next_incident_id(env: &Env) -> u64 {
    let id = env.storage().instance().get(&INCIDENT_COUNTER).unwrap_or(1);
    env.storage().instance().extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
    id
}

pub fn increment_incident_id(env: &Env) {
    let next_id = get_next_incident_id(env) + 1;
    env.storage().instance().set(&INCIDENT_COUNTER, &next_id);
    env.storage().instance().extend_ttl(INSTANCE_LIFETIME, INSTANCE_LIFETIME);
}

pub fn set_security_incident(env: &Env, incident_id: u64, incident: &SecurityIncident) {
    let key = (INCIDENT_PREFIX, incident_id);
    env.storage().persistent().set(&key, incident);
    env.storage().persistent().extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

pub fn get_security_incident(env: &Env, incident_id: u64) -> Result<SecurityIncident, LumentixError> {
    let key = (INCIDENT_PREFIX, incident_id);
    let incident = env.storage().persistent().get(&key).ok_or(LumentixError::SecurityIncidentNotFound)?;
    env.storage().persistent().extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    Ok(incident)
}

// ═══════════════════════════════════════════════════════════════════════════
// Personalization Engine Storage Helpers
// ═══════════════════════════════════════════════════════════════════════════

pub fn set_user_preferences(env: &Env, user: &Address, prefs: &UserPreferences) {
    let key = (USER_PREFS_PREFIX, user.clone());
    env.storage().persistent().set(&key, prefs);
    env.storage().persistent().extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

pub fn get_user_preferences(env: &Env, user: &Address) -> Result<UserPreferences, LumentixError> {
    let key = (USER_PREFS_PREFIX, user.clone());
    let prefs = env.storage().persistent().get(&key).ok_or(LumentixError::Unauthorized)?;
    env.storage().persistent().extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    Ok(prefs)
}
