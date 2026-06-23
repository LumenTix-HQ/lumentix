#![allow(deprecated)]

use soroban_sdk::{symbol_short, Address, BytesN, Env, String, Symbol, Vec};

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
    pub fn emit(
        env: &Env,
        admin_executor: Address,
        old_recipient: Address,
        new_recipient: Address,
    ) {
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
        env.events()
            .publish((symbol_short!("batchtrn"),), (from, to, ticket_ids));
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
        env.events()
            .publish((symbol_short!("wjoin"),), (event_id, buyer, position));
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
    pub fn emit(
        env: &Env,
        booking_id: u64,
        event_id: u64,
        attendee: Address,
        accommodation_type: String,
    ) {
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
        env.events()
            .publish((symbol_short!("vencreate"),), (event_id, sections));
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
        env.events()
            .publish((symbol_short!("seatrele"),), (event_id, seat_id));
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CURRENCY EVENTS
// ═══════════════════════════════════════════════════════════════════════════

/// Event emitted when an event currency is set
pub struct EventCurrencySet;

impl EventCurrencySet {
    pub fn emit(env: &Env, event_id: u64, currency: String) {
        env.events()
            .publish((symbol_short!("curset"),), (event_id, currency));
    }
}

/// Event emitted when an oracle price is updated
pub struct OraclePriceUpdated;

impl OraclePriceUpdated {
    pub fn emit(env: &Env, currency: String, price: i128, timestamp: u64) {
        env.events()
            .publish((symbol_short!("oracleprc"),), (currency, price, timestamp));
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
            (
                policy_id,
                ticket_id,
                event_id,
                holder,
                premium_paid,
                coverage_amount,
            ),
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
            (
                policy_id,
                ticket_id,
                event_id,
                claimant,
                claim_amount,
                reason,
            ),
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
            (
                review_id,
                event_id,
                reviewer,
                organizer,
                rating,
                attendance_verified,
            ),
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
        env.events()
            .publish((symbol_short!("attfail"),), (review_id, reviewer));
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
            (
                organizer,
                reputation_score,
                average_rating_x100,
                total_reviews,
            ),
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// UPGRADE MECHANISM EVENTS
// ═══════════════════════════════════════════════════════════════════════════

/// Emitted when an upgrade proposal is created
pub struct UpgradeProposed;

impl UpgradeProposed {
    pub fn emit(
        env: &Env,
        proposal_id: u64,
        proposer: Address,
        new_wasm_hash: BytesN<32>,
        description: String,
        voting_deadline: u64,
    ) {
        env.events().publish(
            (symbol_short!("upgprop"),),
            (
                proposal_id,
                proposer,
                new_wasm_hash,
                description,
                voting_deadline,
            ),
        );
    }
}

/// Emitted when a vote is cast on an upgrade proposal
pub struct UpgradeVoteCast;

impl UpgradeVoteCast {
    pub fn emit(
        env: &Env,
        proposal_id: u64,
        voter: Address,
        vote_yes: bool,
        total_yes: u32,
        total_no: u32,
    ) {
        env.events().publish(
            (symbol_short!("upgvote"),),
            (proposal_id, voter, vote_yes, total_yes, total_no),
        );
    }
}

/// Emitted when an upgrade proposal is executed
pub struct UpgradeExecuted;

impl UpgradeExecuted {
    pub fn emit(env: &Env, proposal_id: u64, executor: Address, new_wasm_hash: BytesN<32>) {
        env.events().publish(
            (symbol_short!("upgexec"),),
            (proposal_id, executor, new_wasm_hash),
        );
    }
}

/// Emitted when governance config is updated
pub struct UpgradeGovernanceConfigUpdated;

impl UpgradeGovernanceConfigUpdated {
    pub fn emit(
        env: &Env,
        admin: Address,
        voting_period_seconds: u64,
        required_approval_percentage: u32,
        member_count: u32,
    ) {
        env.events().publish(
            (symbol_short!("upgcfg"),),
            (
                admin,
                voting_period_seconds,
                required_approval_percentage,
                member_count,
            ),
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CARBON OFFSET EVENTS
// ═══════════════════════════════════════════════════════════════════════════

/// Emitted when a carbon footprint is calculated for an event
pub struct CarbonFootprintCalculated;

impl CarbonFootprintCalculated {
    pub fn emit(
        env: &Env,
        event_id: u64,
        total_footprint_kg: i128,
        venue_kg: i128,
        attendance_kg: i128,
        travel_kg: i128,
    ) {
        env.events().publish(
            (symbol_short!("carboncal"),),
            (
                event_id,
                total_footprint_kg,
                venue_kg,
                attendance_kg,
                travel_kg,
            ),
        );
    }
}

/// Emitted when a carbon offset is purchased
pub struct CarbonOffsetPurchased;

impl CarbonOffsetPurchased {
    pub fn emit(
        env: &Env,
        purchase_id: u64,
        event_id: u64,
        purchaser: Address,
        offset_amount_kg: i128,
        cost: i128,
        project_id: String,
    ) {
        env.events().publish(
            (symbol_short!("carbonpur"),),
            (
                purchase_id,
                event_id,
                purchaser,
                offset_amount_kg,
                cost,
                project_id,
            ),
        );
    }
}

/// Emitted when environmental impact is tracked/updated
pub struct EnvironmentalImpactUpdated;

impl EnvironmentalImpactUpdated {
    pub fn emit(
        env: &Env,
        event_id: u64,
        total_footprint_kg: i128,
        total_offset_kg: i128,
        net_impact_kg: i128,
        neutral: bool,
    ) {
        env.events().publish(
            (symbol_short!("envimp"),),
            (
                event_id,
                total_footprint_kg,
                total_offset_kg,
                net_impact_kg,
                neutral,
            ),
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// IDENTITY VERIFICATION EVENTS
// ═══════════════════════════════════════════════════════════════════════════

/// Emitted when an identity credential is issued
pub struct IdentityCredentialIssued;

impl IdentityCredentialIssued {
    pub fn emit(
        env: &Env,
        credential_id: u64,
        subject: Address,
        provider: crate::types::IdentityProvider,
        level: u32,
        expires_at: u64,
    ) {
        env.events().publish(
            (symbol_short!("idcrdiss"),),
            (credential_id, subject, provider, level, expires_at),
        );
    }
}

/// Emitted when a blockchain identity is verified
pub struct BlockchainIdentityVerified;

impl BlockchainIdentityVerified {
    pub fn emit(
        env: &Env,
        credential_id: u64,
        subject: Address,
        provider: crate::types::IdentityProvider,
        verified: bool,
    ) {
        env.events().publish(
            (symbol_short!("idverif"),),
            (credential_id, subject, provider, verified),
        );
    }
}

/// Emitted when an identity credential is revoked
pub struct IdentityCredentialRevoked;

impl IdentityCredentialRevoked {
    pub fn emit(env: &Env, credential_id: u64, subject: Address, admin: Address) {
        env.events()
            .publish((symbol_short!("idrevok"),), (credential_id, subject, admin));
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-CHAIN TICKET PORTABILITY EVENTS
// ═══════════════════════════════════════════════════════════════════════════

/// Emitted when a cross-chain transfer is initiated
pub struct CrossChainTransferInitiated;

impl CrossChainTransferInitiated {
    pub fn emit(
        env: &Env,
        transfer_id: u64,
        ticket_id: u64,
        event_id: u64,
        sender: Address,
        source_chain: String,
        target_chain: String,
    ) {
        env.events().publish(
            (symbol_short!("cctinit"),),
            (
                transfer_id,
                ticket_id,
                event_id,
                sender,
                source_chain,
                target_chain,
            ),
        );
    }
}

/// Emitted when a bridge transaction is validated
pub struct BridgeTransactionValidated;

impl BridgeTransactionValidated {
    pub fn emit(env: &Env, transfer_id: u64, tx_hash: String, valid: bool, validator: Address) {
        env.events().publish(
            (symbol_short!("brgval"),),
            (transfer_id, tx_hash, valid, validator),
        );
    }
}

/// Emitted when a cross-chain transfer is completed
pub struct CrossChainTransferCompleted;

impl CrossChainTransferCompleted {
    pub fn emit(
        env: &Env,
        transfer_id: u64,
        ticket_id: u64,
        recipient: Address,
        target_chain: String,
    ) {
        env.events().publish(
            (symbol_short!("cctcomp"),),
            (transfer_id, ticket_id, recipient, target_chain),
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// MERCHANDISE & NFT COLLECTIBLE EVENTS
// ═══════════════════════════════════════════════════════════════════════════

/// Emitted when event merchandise is created
pub struct MerchandiseCreated;

impl MerchandiseCreated {
    pub fn emit(
        env: &Env,
        merchandise_id: u64,
        event_id: u64,
        organizer: Address,
        name: String,
        price: i128,
        total_supply: u32,
    ) {
        env.events().publish(
            (soroban_sdk::Symbol::new(env, "merccreate"),),
            (
                merchandise_id,
                event_id,
                organizer,
                name,
                price,
                total_supply,
            ),
        );
    }
}

/// Emitted when a merchandise item is purchased
pub struct MerchandisePurchased;

impl MerchandisePurchased {
    pub fn emit(
        env: &Env,
        merchandise_id: u64,
        event_id: u64,
        buyer: Address,
        price: i128,
        remaining_supply: u32,
    ) {
        env.events().publish(
            (symbol_short!("mercbuy"),),
            (
                merchandise_id,
                event_id,
                buyer,
                price,
                remaining_supply,
            ),
        );
    }
}

/// Emitted when a commemorative NFT is minted
pub struct NftMinted;

impl NftMinted {
    pub fn emit(
        env: &Env,
        nft_id: u64,
        event_id: u64,
        owner: Address,
        rarity: crate::types::RarityTier,
        minted_at: u64,
    ) {
        env.events().publish(
            (symbol_short!("nftmint"),),
            (nft_id, event_id, owner, rarity, minted_at),
        );
    }
}

/// Emitted when an NFT collectible is traded/transferred
pub struct NftTraded;

impl NftTraded {
    pub fn emit(env: &Env, nft_id: u64, event_id: u64, from: Address, to: Address) {
        env.events().publish(
            (symbol_short!("nfttrade"),),
            (nft_id, event_id, from, to),
        );
    }
}

/// Emitted when collectible inventory is configured or updated
pub struct CollectibleInventoryUpdated;

impl CollectibleInventoryUpdated {
    pub fn emit(
        env: &Env,
        event_id: u64,
        max_supply: u32,
        total_minted: u32,
    ) {
        env.events().publish(
            (symbol_short!("colinvup"),),
            (event_id, max_supply, total_minted),
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW FEATURES EVENTS
// ═══════════════════════════════════════════════════════════════════════════

pub struct VenueSpaceAllocated;
impl VenueSpaceAllocated {
    pub fn emit(env: &Env, event_id: u64, venue_id: String, space_id: String, capacity: u32) {
        env.events().publish(
            (soroban_sdk::Symbol::new(env, "venue_space_allocated"),),
            (event_id, venue_id, space_id, capacity),
        );
    }
}

pub struct SpaceUtilizationOptimized;
impl SpaceUtilizationOptimized {
    pub fn emit(env: &Env, venue_id: String, space_id: String, timestamp: u64) {
        env.events().publish(
            (soroban_sdk::Symbol::new(env, "space_utilization_optimized"),),
            (venue_id, space_id, timestamp),
        );
    }
}

pub struct VenueConflictManaged;
impl VenueConflictManaged {
    pub fn emit(env: &Env, venue_id: String, space_id: String, timestamp: u64) {
        env.events().publish(
            (soroban_sdk::Symbol::new(env, "venue_conflict_managed"),),
            (venue_id, space_id, timestamp),
        );
    }
}

pub struct SubscriptionPlanCreated;
impl SubscriptionPlanCreated {
    pub fn emit(env: &Env, plan_id: u64, series_id: u64, price: i128, billing_interval: u64) {
        env.events().publish(
            (soroban_sdk::Symbol::new(env, "subscription_plan_created"),),
            (plan_id, series_id, price, billing_interval),
        );
    }
}

pub struct RecurringBillingProcessed;
impl RecurringBillingProcessed {
    pub fn emit(env: &Env, subscriber: Address, plan_id: u64, amount: i128, expiration_time: u64) {
        env.events().publish(
            (soroban_sdk::Symbol::new(env, "recurring_billing_processed"),),
            (subscriber, plan_id, amount, expiration_time),
        );
    }
}

pub struct SubscriptionStatusValidated;
impl SubscriptionStatusValidated {
    pub fn emit(env: &Env, subscriber: Address, plan_id: u64, active: bool, expiration_time: u64) {
        env.events().publish(
            (soroban_sdk::Symbol::new(env, "subscription_status_validated"),),
            (subscriber, plan_id, active, expiration_time),
        );
    }
}

pub struct SecurityThreatMonitored;
impl SecurityThreatMonitored {
    pub fn emit(env: &Env, target_address: Address, threat_score: u32, timestamp: u64) {
        env.events().publish(
            (soroban_sdk::Symbol::new(env, "security_threat_monitored"),),
            (target_address, threat_score, timestamp),
        );
    }
}

pub struct SuspiciousActivityDetected;
impl SuspiciousActivityDetected {
    pub fn emit(env: &Env, target_address: Address, activity_type: String, timestamp: u64) {
        env.events().publish(
            (soroban_sdk::Symbol::new(env, "suspicious_activity_detected"),),
            (target_address, activity_type, timestamp),
        );
    }
}

pub struct IncidentResponded;
impl IncidentResponded {
    pub fn emit(env: &Env, incident_id: u64, action: String, timestamp: u64) {
        env.events().publish(
            (soroban_sdk::Symbol::new(env, "incident_responded"),),
            (incident_id, action, timestamp),
        );
    }
}

pub struct UserExperiencePersonalized;
impl UserExperiencePersonalized {
    pub fn emit(env: &Env, user: Address, categories: Vec<String>, max_price: i128, timestamp: u64) {
        env.events().publish(
            (soroban_sdk::Symbol::new(env, "user_experience_personalized"),),
            (user, categories, max_price, timestamp),
        );
    }
}

pub struct EventRecommendationsCustomized;
impl EventRecommendationsCustomized {
    pub fn emit(env: &Env, user: Address, recommended_count: u32, timestamp: u64) {
        env.events().publish(
            (soroban_sdk::Symbol::new(env, "event_recommendations_customized"),),
            (user, recommended_count, timestamp),
        );
    }
}

pub struct UserJourneyOptimized;
impl UserJourneyOptimized {
    pub fn emit(env: &Env, user: Address, step_count: u32, timestamp: u64) {
        env.events().publish(
            (soroban_sdk::Symbol::new(env, "user_journey_optimized"),),
            (user, step_count, timestamp),
        );
    }
}
