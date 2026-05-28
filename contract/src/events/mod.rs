#![allow(deprecated)]

use soroban_sdk::{symbol_short, Address, Env, String, Symbol, Vec};

/// A type for transfer of event
pub struct TransferEvent;

impl TransferEvent {
    pub fn emit(env: &Env, ticket_id: Symbol, from: Address, to: Address) {
        env.events()
            .publish((symbol_short!("transfer"),), (ticket_id, from, to));
    }
}

/// Event emitted when a ticket is checked in (validated)
pub struct CheckInEvent;

impl CheckInEvent {
    pub fn emit(env: &Env, ticket_id: Symbol, validator: Address, event_id: Symbol) {
        env.events().publish(
            (symbol_short!("checkin"),),
            (ticket_id, validator, event_id),
        );
    }
}

/// Event emitted when a new event is created
pub struct EventCreated;

impl EventCreated {
    #[allow(clippy::too_many_arguments)]
    pub fn emit(
        env: &Env,
        event_id: u64,
        organizer: Address,
        name: String,
        ticket_price: i128,
        max_tickets: u32,
        start_time: u64,
        end_time: u64,
    ) {
        env.events().publish(
            (symbol_short!("evtcreate"),),
            (
                event_id,
                organizer,
                name,
                ticket_price,
                max_tickets,
                start_time,
                end_time,
            ),
        );
    }
}

/// Event emitted when platform fee is updated
pub struct PlatformFeeUpdated;

impl PlatformFeeUpdated {
    pub fn emit(env: &Env, admin: Address, old_fee_bps: u32, new_fee_bps: u32) {
        env.events().publish(
            (symbol_short!("feeupdate"),),
            (admin, old_fee_bps, new_fee_bps),
        );
    }
}

/// Event emitted when the platform fee recipient (admin) is changed via
/// [`crate::lumentix_contract::LumentixContract::change_admin`].
/// Carries `admin_executor`, `old_recipient`, and `new_recipient`
/// so Dapp indexing solutions can detect treasury restructuring transparently.
pub struct PlatformFeeRecipientUpdated;

impl PlatformFeeRecipientUpdated {
    pub fn emit(env: &Env, admin_executor: Address, old_recipient: Address, new_recipient: Address) {
        env.events().publish(
            (symbol_short!("feerecip"),),
            (admin_executor, old_recipient, new_recipient),
        );
    }
}

/// Event emitted when an organizer cancels a published event.
pub struct EventCancelled;

impl EventCancelled {
    pub fn emit(env: &Env, event_id: u64, organizer: Address, tickets_sold: u32) {
        env.events().publish(
            (symbol_short!("evcncld"),),
            (event_id, organizer, tickets_sold),
        );
    }
}

/// Event emitted when an event status transitions
pub struct EventStatusChanged;

impl EventStatusChanged {
    pub fn emit(
        env: &Env,
        event_id: u64,
        caller: Address,
        old_status: crate::types::EventStatus,
        new_status: crate::types::EventStatus,
    ) {
        env.events().publish(
            (symbol_short!("stschng"),),
            (event_id, caller, old_status, new_status),
        );
    }
}

/// Event emitted when an event is completed
pub struct EventCompleted;

impl EventCompleted {
    pub fn emit(env: &Env, event_id: u64, organizer: Address, tickets_sold: u32) {
        env.events().publish(
            (symbol_short!("evtcmpl"),),
            (event_id, organizer, tickets_sold),
        );
    }
}

/// Event emitted when platform fees are withdrawn
pub struct PlatformFeesWithdrawn;

impl PlatformFeesWithdrawn {
    pub fn emit(env: &Env, admin: Address, amount: i128) {
        env.events()
            .publish((symbol_short!("feewith"),), (admin, amount));
    }
}

/// Event emitted when admin address is changed
pub struct AdminChanged;

impl AdminChanged {
    pub fn emit(env: &Env, caller: Address, old_admin: Address, new_admin: Address) {
        env.events()
            .publish((symbol_short!("admchng"),), (caller, old_admin, new_admin));
    }
}

/// Event emitted when an event is updated
pub struct EventUpdated;

impl EventUpdated {
    #[allow(clippy::too_many_arguments)]
    pub fn emit(
        env: &Env,
        event_id: u64,
        organizer: Address,
        name: String,
        description: String,
        location: String,
        start_time: u64,
        end_time: u64,
        ticket_price: i128,
        max_tickets: u32,
    ) {
        env.events().publish(
            (symbol_short!("evtupdt"),),
            (
                event_id,
                organizer,
                name,
                description,
                location,
                start_time,
                end_time,
                ticket_price,
                max_tickets,
            ),
        );
    }
}

pub struct TicketPurchased;

impl TicketPurchased {
    pub fn emit(
        env: &Env,
        ticket_id: u64,
        event_id: u64,
        buyer: Address,
        amount: i128,
        platform_fee: i128,
        organizer_amount: i128,
    ) {
        env.events().publish(
            (symbol_short!("tktbuy"),),
            (
                ticket_id,
                event_id,
                buyer,
                amount,
                platform_fee,
                organizer_amount,
            ),
        );
    }
}

/// Event emitted when multiple tickets are purchased in a single batch via
/// [`crate::lumentix_contract::LumentixContract::batch_purchase_tickets`].
/// Exposes `event_id`, `buyer`, `quantity`, `total_price`, and `starting_ticket_id`
/// so indexers can track bulk purchases without per-ticket event bloat.
pub struct BatchTicketsPurchased;

impl BatchTicketsPurchased {
    pub fn emit(
        env: &Env,
        event_id: u64,
        buyer: Address,
        quantity: u32,
        total_price: i128,
        starting_ticket_id: u64,
    ) {
        env.events().publish(
            (symbol_short!("batchbuy"),),
            (event_id, buyer, quantity, total_price, starting_ticket_id),
        );
    }
}

/// Event emitted when a ticket is transferred from one owner to another
pub struct TicketTransferred;

impl TicketTransferred {
    pub fn emit(env: &Env, ticket_id: u64, event_id: u64, from: Address, to: Address) {
        env.events().publish(
            (symbol_short!("tkttrans"), ticket_id, event_id),
            (ticket_id, event_id, from, to),
        );
    }
}

/// Event emitted when multiple tickets are transferred in a single batch via
/// [`crate::lumentix_contract::LumentixContract::batch_transfer_tickets`].
/// Carries `from`, `to`, and the full `Vec<u64>` of transferred ticket IDs
/// so indexers can update ownership in one operation without per-ticket noise.
pub struct BatchTicketsTransferred;

impl BatchTicketsTransferred {
    pub fn emit(env: &Env, from: Address, to: Address, ticket_ids: Vec<u64>) {
        env.events().publish(
            (symbol_short!("batchtrn"),),
            (from, to, ticket_ids),
        );
    }
}

/// Event emitted when a ticket is marked as used (checked in)
pub struct TicketUsed;

impl TicketUsed {
    pub fn emit(env: &Env, ticket_id: u64, event_id: u64, owner: Address, caller: Address) {
        env.events().publish(
            (symbol_short!("tktused"),),
            (ticket_id, event_id, owner, caller),
        );
    }
}

/// Event emitted when multiple tickets are checked in via [`crate::lumentix_contract::LumentixContract::batch_use_tickets`].
/// Carries `event_id`, `quantity`, and the list of `ticket_ids` so indexers can update headcounts without one log line per ticket.
pub struct BatchTicketsUsed;

impl BatchTicketsUsed {
    pub fn emit(env: &Env, event_id: u64, quantity: u32, ticket_ids: Vec<u64>) {
        env.events().publish(
            (symbol_short!("batchuse"),),
            (event_id, quantity, ticket_ids),
        );
    }
}

/// Event emitted when a buyer joins an event waitlist.
pub struct WaitlistJoined;

impl WaitlistJoined {
    pub fn emit(env: &Env, event_id: u64, buyer: Address, position: u32) {
        env.events().publish(
            (symbol_short!("wjoin"),),
            (event_id, buyer, position),
        );
    }
}

/// Event emitted when waitlist members receive a reservation offer.
pub struct WaitlistAvailabilityNotified;

impl WaitlistAvailabilityNotified {
    pub fn emit(env: &Env, event_id: u64, buyer: Address, quantity: u32, expires_at: u64) {
        env.events().publish(
            (symbol_short!("wnotify"),),
            (event_id, buyer, quantity, expires_at),
        );
    }
}

/// Event emitted when a ticket is refunded
pub struct TicketRefunded;

impl TicketRefunded {
    pub fn emit(env: &Env, ticket_id: u64, event_id: u64, buyer: Address, refund_amount: i128) {
        env.events().publish(
            (symbol_short!("tktrefnd"),),
            (ticket_id, event_id, buyer, refund_amount),
        );
    }
}

/// Event emitted when escrow funds are released to an organizer
pub struct EscrowReleased;

impl EscrowReleased {
    pub fn emit(env: &Env, event_id: u64, organizer: Address, amount: i128) {
        env.events()
            .publish((symbol_short!("escrwrel"),), (event_id, organizer, amount));
    }
}

/// Diagnostic event emitted on each successful [`crate::lumentix_contract::LumentixContract::get_protocol_fee`]
/// invocation. Carries the current fee (bps) and admin recipient for analytics and indexers; not a state change.
pub struct ProtocolFeeQueried;

impl ProtocolFeeQueried {
    pub fn emit(env: &Env, fee_bps: u32, fee_recipient: Address) {
        env.events()
            .publish((symbol_short!("feequery"),), (fee_bps, fee_recipient));
    }
}

/// Event emitted when funds are deposited into a group's treasury.
pub struct FundsDeposited;

impl FundsDeposited {
    pub fn emit(env: &Env, event_id: u64, depositor: Address, amount: i128, new_balance: i128) {
        env.events().publish(
            (symbol_short!("deposit"),),
            (event_id, depositor, amount, new_balance),
        );
    }
}

/// Event emitted when funds are withdrawn from a group's treasury.
pub struct FundsWithdrawn;

impl FundsWithdrawn {
    pub fn emit(env: &Env, event_id: u64, withdrawer: Address, amount: i128, new_balance: i128) {
        env.events().publish(
            (symbol_short!("withdraw"),),
            (event_id, withdrawer, amount, new_balance),
        );
    }
}

/// Event emitted when event metadata is updated (name, description, location, times, price, capacity).
/// Enables front-end graph indexers to reflect changed event information dynamically without polling.
pub struct EventMetadataUpdated;

impl EventMetadataUpdated {
    pub fn emit(env: &Env, event_id: u64, organizer: Address, time_updated: u64) {
        env.events().publish(
            (symbol_short!("evtmeta"),),
            (event_id, organizer, time_updated),
        );
    }
}

/// Event emitted when ticket sales for an event are paused by the organizer.
/// Informs users in real-time that an event they are purchasing has gone offline.
pub struct EventSalesPaused;

impl EventSalesPaused {
    pub fn emit(env: &Env, event_id: u64, organizer: Address, timestamp: u64) {
        env.events().publish(
            (symbol_short!("salespaus"),),
            (event_id, organizer, timestamp),
        );
    }
}

/// Event emitted when ticket sales for a paused event are resumed by the organizer.
/// Restores UI cart validity for users waiting on the event.
pub struct EventSalesResumed;

impl EventSalesResumed {
    pub fn emit(env: &Env, event_id: u64, organizer: Address, timestamp: u64) {
        env.events().publish(
            (symbol_short!("salesrsm"),),
            (event_id, organizer, timestamp),
        );
    }
}

/// Universal event emitted anytime an EventStatus switches (e.g. Draft -> Published, Active -> Cancelled).
/// Standardizes indexer states minimizing specific listener configuration.
pub struct GenericEventStateTransition;

impl GenericEventStateTransition {
    pub fn emit(
        env: &Env,
        event_id: u64,
        caller: Address,
        old_status: crate::types::EventStatus,
        new_status: crate::types::EventStatus,
    ) {
        env.events().publish(
            (symbol_short!("genstsch"),),
            (event_id, caller, old_status, new_status),
        );
    }
}

/// Event emitted when an event's capacity is changed.
/// Alerts scalpers, waitlists, and potential buyers of capacity changes immediately.
pub struct EventCapacityChanged;

impl EventCapacityChanged {
    pub fn emit(env: &Env, event_id: u64, old_capacity: u32, new_capacity: u32) {
        env.events().publish(
            (symbol_short!("capchng"),),
            (event_id, old_capacity, new_capacity),
        );
    }
}

/// Event emitted when a ticket is revoked by an admin.
/// Provides audit trail for admin tampering actions and builds off-chain trust graphs.
pub struct TicketRevoked;

impl TicketRevoked {
    pub fn emit(
        env: &Env,
        admin_address: Address,
        ticket_id: u64,
        event_id: u64,
        reason: Option<String>,
    ) {
        env.events().publish(
            (symbol_short!("tktrevok"),),
            (admin_address, ticket_id, event_id, reason),
        );
    }
}

/// Event emitted when an event's end time is extended.
/// Notifies attendees of prolonged event times for mobile push alerts.
pub struct EventTimeExtended;

impl EventTimeExtended {
    pub fn emit(env: &Env, event_id: u64, previous_end_time: u64, new_end_time: u64) {
        env.events().publish(
            (symbol_short!("timeext"),),
            (event_id, previous_end_time, new_end_time),
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// VIP TIER EVENTS
// ═══════════════════════════════════════════════════════════════════════════

/// Event emitted when a VIP tier is created for an event
pub struct VipTierCreated;

impl VipTierCreated {
    pub fn emit(env: &Env, event_id: u64, tier_name: String, price: i128, max_slots: u32) {
        env.events().publish(
            (symbol_short!("vipcreate"),),
            (event_id, tier_name, price, max_slots),
        );
    }
}

/// Event emitted when a VIP ticket is assigned to a tier
pub struct VipTicketAssigned;

impl VipTicketAssigned {
    pub fn emit(env: &Env, ticket_id: u64, event_id: u64, tier_name: String, owner: Address) {
        env.events().publish(
            (symbol_short!("vipassign"),),
            (ticket_id, event_id, tier_name, owner),
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ACCESSIBILITY EVENTS
// ═══════════════════════════════════════════════════════════════════════════

/// Event emitted when accessibility inventory is configured
pub struct AccessibilityInventoryUpdated;

impl AccessibilityInventoryUpdated {
    pub fn emit(env: &Env, event_id: u64, wheelchair: u32, hearing: u32, visual: u32) {
        env.events().publish(
            (symbol_short!("accinvup"),),
            (event_id, wheelchair, hearing, visual),
        );
    }
}

/// Event emitted when an accessibility booking is made
pub struct AccessibilityBooked;

impl AccessibilityBooked {
    pub fn emit(env: &Env, booking_id: u64, event_id: u64, attendee: Address, accommodation_type: String) {
        env.events().publish(
            (symbol_short!("accbooked"),),
            (booking_id, event_id, attendee, accommodation_type),
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// VENUE / SEAT EVENTS
// ═══════════════════════════════════════════════════════════════════════════

/// Event emitted when a venue layout is created
pub struct VenueLayoutCreated;

impl VenueLayoutCreated {
    pub fn emit(env: &Env, event_id: u64, sections: u32) {
        env.events().publish(
            (symbol_short!("vencreate"),),
            (event_id, sections),
        );
    }
}

/// Event emitted when a seat is selected/held
pub struct SeatSelected;

impl SeatSelected {
    pub fn emit(env: &Env, event_id: u64, seat_id: String, occupant: Address, held_until: u64) {
        env.events().publish(
            (symbol_short!("seatsel"),),
            (event_id, seat_id, occupant, held_until),
        );
    }
}

/// Event emitted when a seat hold is released
pub struct SeatHoldReleased;

impl SeatHoldReleased {
    pub fn emit(env: &Env, event_id: u64, seat_id: String) {
        env.events().publish(
            (symbol_short!("seatrele"),),
            (event_id, seat_id),
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CURRENCY EVENTS
// ═══════════════════════════════════════════════════════════════════════════

/// Event emitted when an event currency is set
pub struct EventCurrencySet;

impl EventCurrencySet {
    pub fn emit(env: &Env, event_id: u64, currency: String) {
        env.events().publish(
            (symbol_short!("curset"),),
            (event_id, currency),
        );
    }
}

/// Event emitted when an oracle price is updated
pub struct OraclePriceUpdated;

impl OraclePriceUpdated {
    pub fn emit(env: &Env, currency: String, price: i128, timestamp: u64) {
        env.events().publish(
            (symbol_short!("oracleprc"),),
            (currency, price, timestamp),
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// INSURANCE EVENTS
// ═══════════════════════════════════════════════════════════════════════════

/// Event emitted when insurance is purchased for a ticket
pub struct InsurancePurchased;

impl InsurancePurchased {
    pub fn emit(
        env: &Env,
        policy_id: u64,
        ticket_id: u64,
        event_id: u64,
        holder: Address,
        premium_paid: i128,
        coverage_amount: i128,
    ) {
        env.events().publish(
            (symbol_short!("insbuy"),),
            (policy_id, ticket_id, event_id, holder, premium_paid, coverage_amount),
        );
    }
}

/// Event emitted when an insurance claim is processed
pub struct InsuranceClaimProcessed;

impl InsuranceClaimProcessed {
    pub fn emit(
        env: &Env,
        policy_id: u64,
        ticket_id: u64,
        event_id: u64,
        claimant: Address,
        claim_amount: i128,
        reason: crate::types::CancellationReason,
    ) {
        env.events().publish(
            (symbol_short!("insclaim"),),
            (policy_id, ticket_id, event_id, claimant, claim_amount, reason),
        );
    }
}

/// Event emitted when insurance pool balance is updated
pub struct InsurancePoolUpdated;

impl InsurancePoolUpdated {
    pub fn emit(env: &Env, total_balance: i128, total_policies: u32, total_claims_paid: i128) {
        env.events().publish(
            (symbol_short!("inspool"),),
            (total_balance, total_policies, total_claims_paid),
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// REVIEW & REPUTATION EVENTS
// ═══════════════════════════════════════════════════════════════════════════

/// Emitted when a verified attendee submits an event review
pub struct ReviewSubmitted;

impl ReviewSubmitted {
    pub fn emit(
        env: &Env,
        review_id: u64,
        event_id: u64,
        reviewer: Address,
        organizer: Address,
        rating: u32,
        attendance_verified: bool,
    ) {
        env.events().publish(
            (symbol_short!("revsubmt"),),
            (review_id, event_id, reviewer, organizer, rating, attendance_verified),
        );
    }
}

/// Emitted when a reviewer's attendance is confirmed
pub struct AttendanceVerified;

impl AttendanceVerified {
    pub fn emit(env: &Env, review_id: u64, event_id: u64, reviewer: Address, ticket_id: u64) {
        env.events().publish(
            (symbol_short!("attverif"),),
            (review_id, event_id, reviewer, ticket_id),
        );
    }
}

/// Emitted when an attendance verification attempt fails
pub struct AttendanceVerificationFailed;

impl AttendanceVerificationFailed {
    pub fn emit(env: &Env, review_id: u64, reviewer: Address) {
        env.events().publish(
            (symbol_short!("attfail"),),
            (review_id, reviewer),
        );
    }
}

/// Emitted when an organizer's reputation score is recalculated
pub struct ReputationUpdated;

impl ReputationUpdated {
    pub fn emit(
        env: &Env,
        organizer: Address,
        reputation_score: u32,
        average_rating_x100: u32,
        total_reviews: u32,
    ) {
        env.events().publish(
            (symbol_short!("repupdt"),),
            (organizer, reputation_score, average_rating_x100, total_reviews),
        );
    }
}
