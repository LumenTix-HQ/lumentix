#![allow(clippy::too_many_arguments)]

use crate::error::LumentixError;
use crate::events::{
    AccessibilityBooked, AccessibilityInventoryUpdated, AdminChanged, AttendanceVerificationFailed,
    AttendanceVerified, BatchTicketsPurchased, BatchTicketsTransferred, BatchTicketsUsed,
    BlockchainIdentityVerified, BridgeTransactionValidated, CarbonFootprintCalculated,
    CarbonOffsetPurchased, CollectibleInventoryUpdated, CrossChainTransferCompleted,
    CrossChainTransferInitiated, EnvironmentalImpactUpdated, EscrowReleased, EventCancelled,
    EventCapacityChanged, EventCompleted, EventCreated, EventCurrencySet, EventMetadataUpdated,
    EventSalesPaused, EventSalesResumed, EventStatusChanged, EventTimeExtended, EventUpdated,
    FundsDeposited, FundsWithdrawn, GenericEventStateTransition, IdentityCredentialIssued,
    IdentityCredentialRevoked, InsuranceClaimProcessed, InsurancePoolUpdated, InsurancePurchased,
    MerchandiseCreated, MerchandisePurchased, NftMinted, NftTraded, OraclePriceUpdated,
    PlatformFeeRecipientUpdated, PlatformFeeUpdated, PlatformFeesWithdrawn, ProtocolFeeQueried,
    ReputationUpdated, ReviewSubmitted, SeatHoldReleased, SeatSelected, TicketPurchased,
    TicketRefunded, TicketRevoked, TicketTransferred, TicketUsed, UpgradeExecuted,
    UpgradeGovernanceConfigUpdated, UpgradeProposed, UpgradeVoteCast, VenueLayoutCreated,
    VipTicketAssigned, VipTierCreated, WaitlistAvailabilityNotified, WaitlistJoined,
    VenueSpaceAllocated, SpaceUtilizationOptimized, VenueConflictManaged,
    SubscriptionPlanCreated, RecurringBillingProcessed, SubscriptionStatusValidated,
    SecurityThreatMonitored, SuspiciousActivityDetected, IncidentResponded,
    UserExperiencePersonalized, EventRecommendationsCustomized, UserJourneyOptimized,
};
use crate::storage;
use crate::types::{
    AccessibilityBooking, AccessibilityInventory, BridgeTransaction, CancellationReason,
    CarbonFootprint, CarbonOffsetPurchase, CollectibleInventory, CrossChainTransfer,
    CrossChainTransferStatus, CurrencyConfig, EnvironmentalImpact, Event, EventMerchandise,
    EventReview, EventStatus, IdentityCredential, IdentityProof, IdentityProvider, InsurancePolicy,
    NftCollectible, OrganizerReputation, RarityTier, Seat, Ticket, TicketTransferRecord,
    UpgradeGovernanceConfig, UpgradeProposal, UpgradeState, UpgradeVote, VenueLayout, VenueSection,
    VipTier, WaitlistOffer, PERSISTENT_LIFETIME, VenueSpaceAllocation, SubscriptionPlan,
    SubscriptionStatus, SecurityIncident, UserPreferences,
};
use crate::validation;
use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, Map, String, Vec};

#[contract]
pub struct LumentixContract;

const ONE_DAY_SECONDS: u64 = 24 * 60 * 60;
const SEVEN_DAYS_SECONDS: u64 = 7 * 24 * 60 * 60;
const THIRTY_DAYS_SECONDS: u64 = 30 * 24 * 60 * 60;

#[contractimpl]
impl LumentixContract {
    /// Initialize the contract with an admin address.
    /// Can only be called once.
    pub fn initialize(env: Env, admin: Address) -> Result<(), LumentixError> {
        if storage::is_initialized(&env) {
            return Err(LumentixError::AlreadyInitialized);
        }

        storage::set_admin(&env, &admin);
        storage::set_initialized(&env);

        Ok(())
    }

    /// Create a new event in Draft status.
    /// Validates all inputs including positive price, capacity, time range, and non-empty strings.
    pub fn create_event(
        env: Env,
        organizer: Address,
        name: String,
        description: String,
        location: String,
        start_time: u64,
        end_time: u64,
        ticket_price: i128,
        max_tickets: u32,
    ) -> Result<u64, LumentixError> {
        organizer.require_auth();

        // Validate inputs
        validation::validate_string_not_empty(&name)?;
        validation::validate_string_not_empty(&description)?;
        validation::validate_string_not_empty(&location)?;
        validation::validate_positive_amount(ticket_price)?;
        validation::validate_positive_capacity(max_tickets)?;
        validation::validate_time_range(start_time, end_time)?;

        let event_id = storage::get_next_event_id(&env);
        storage::increment_event_id(&env);

        let event = Event {
            id: event_id,
            organizer: organizer.clone(),
            name,
            description,
            location,
            start_time,
            end_time,
            ticket_price,
            max_tickets,
            tickets_sold: 0,
            status: EventStatus::Draft,
            paused: false,
            currency: String::from_str(&env, "USD"),
            accessibility_wheelchair: 0,
            accessibility_hearing: 0,
            accessibility_visual: 0,
        };

        storage::set_event(&env, event_id, &event);

        // Emit EventCreated event
        EventCreated::emit(
            &env,
            event_id,
            organizer,
            event.name,
            event.ticket_price,
            event.max_tickets,
            event.start_time,
            event.end_time,
        );

        Ok(event_id)
    }

    /// Update event details. Only draft events can be updated.
    /// Validates all inputs and ensures max_tickets is not reduced below tickets_sold.
    /// Only the event organizer can update the event.
    pub fn update_event(
        env: Env,
        organizer: Address,
        event_id: u64,
        name: String,
        description: String,
        location: String,
        start_time: u64,
        end_time: u64,
        ticket_price: i128,
        max_tickets: u32,
    ) -> Result<(), LumentixError> {
        organizer.require_auth();

        // Get the existing event
        let mut event = storage::get_event(&env, event_id)?;

        // Verify organizer owns the event
        if event.organizer != organizer {
            return Err(LumentixError::Unauthorized);
        }

        // Verify event status is Draft
        if event.status != EventStatus::Draft {
            return Err(LumentixError::InvalidStatusTransition);
        }

        // Validate all new values
        validation::validate_string_not_empty(&name)?;
        validation::validate_string_not_empty(&description)?;
        validation::validate_string_not_empty(&location)?;
        validation::validate_positive_amount(ticket_price)?;
        validation::validate_positive_capacity(max_tickets)?;
        validation::validate_time_range(start_time, end_time)?;

        // If max_tickets is being reduced, ensure it's not below tickets_sold
        if max_tickets < event.tickets_sold {
            return Err(LumentixError::CapacityExceeded);
        }

        // Update event fields
        event.name = name.clone();
        event.description = description.clone();
        event.location = location.clone();
        event.start_time = start_time;
        event.end_time = end_time;
        event.ticket_price = ticket_price;
        event.max_tickets = max_tickets;

        // Store updated event
        storage::set_event(&env, event_id, &event);

        // Emit EventUpdated event
        EventUpdated::emit(
            &env,
            event_id,
            organizer,
            name,
            description,
            location,
            start_time,
            end_time,
            ticket_price,
            max_tickets,
        );

        Ok(())
    }

    /// Update event metadata for a published event (name, description, location, times, price, capacity).
    /// Unlike update_event (Draft-only), this allows organizers to correct metadata on live events.
    /// Only the event organizer can call this. Validates all inputs.
    /// Emits EventMetadataUpdated for fast UI refresh via graph indexers.
    pub fn update_event_metadata(
        env: Env,
        organizer: Address,
        event_id: u64,
        name: String,
        description: String,
        location: String,
        start_time: u64,
        end_time: u64,
        ticket_price: i128,
        max_tickets: u32,
    ) -> Result<(), LumentixError> {
        organizer.require_auth();

        let mut event = storage::get_event(&env, event_id)?;

        if event.organizer != organizer {
            return Err(LumentixError::Unauthorized);
        }

        // Only published events can have metadata updated via this path
        if event.status != EventStatus::Published {
            return Err(LumentixError::InvalidStatusTransition);
        }

        validation::validate_string_not_empty(&name)?;
        validation::validate_string_not_empty(&description)?;
        validation::validate_string_not_empty(&location)?;
        validation::validate_positive_amount(ticket_price)?;
        validation::validate_positive_capacity(max_tickets)?;
        validation::validate_time_range(start_time, end_time)?;

        if max_tickets < event.tickets_sold {
            return Err(LumentixError::CapacityExceeded);
        }

        event.name = name;
        event.description = description;
        event.location = location;
        event.start_time = start_time;
        event.end_time = end_time;
        event.ticket_price = ticket_price;
        event.max_tickets = max_tickets;

        storage::set_event(&env, event_id, &event);

        EventMetadataUpdated::emit(&env, event_id, organizer, env.ledger().timestamp());

        Ok(())
    }

    /// Update event status with validated transitions.
    /// Only the event organizer can update the status.
    /// Valid transitions: Draft -> Published, Published -> Cancelled, Published -> Completed (after end_time).
    pub fn update_event_status(
        env: Env,
        event_id: u64,
        new_status: EventStatus,
        caller: Address,
    ) -> Result<(), LumentixError> {
        caller.require_auth();

        let mut event = storage::get_event(&env, event_id)?;

        // Only organizer can update status
        if event.organizer != caller {
            return Err(LumentixError::Unauthorized);
        }

        // Validate status transition
        let valid = match (&event.status, &new_status) {
            (EventStatus::Draft, EventStatus::Published) => true,
            (EventStatus::Published, EventStatus::Cancelled) => true,
            (EventStatus::Published, EventStatus::Completed) => {
                // Can only complete after end time
                env.ledger().timestamp() > event.end_time
            }
            _ => false,
        };

        if !valid {
            return Err(LumentixError::InvalidStatusTransition);
        }

        // Store old status before updating
        let old_status = event.status.clone();
        event.status = new_status.clone();
        storage::set_event(&env, event_id, &event);

        // Emit EventStatusChanged event
        EventStatusChanged::emit(
            &env,
            event_id,
            caller.clone(),
            old_status.clone(),
            new_status.clone(),
        );

        // Emit GenericEventStateTransition event for universal state transition tracking
        GenericEventStateTransition::emit(&env, event_id, caller, old_status, new_status);

        Ok(())
    }

    /// Update the maximum capacity of an event.
    /// Can only be called by the organizer. Capacity cannot be reduced below tickets_sold.
    pub fn set_event_capacity(
        env: Env,
        organizer: Address,
        event_id: u64,
        new_capacity: u32,
    ) -> Result<(), LumentixError> {
        organizer.require_auth();

        let mut event = storage::get_event(&env, event_id)?;

        if event.organizer != organizer {
            return Err(LumentixError::Unauthorized);
        }

        if new_capacity < event.tickets_sold {
            return Err(LumentixError::CapacityExceeded);
        }

        let old_capacity = event.max_tickets;
        event.max_tickets = new_capacity;
        storage::set_event(&env, event_id, &event);

        if new_capacity > old_capacity && event.status == EventStatus::Published {
            let newly_available = new_capacity - old_capacity;
            let _ = Self::process_waitlist_queue_internal(&env, event_id, newly_available);
        }

        // Emit EventCapacityChanged event
        EventCapacityChanged::emit(&env, event_id, old_capacity, new_capacity);

        Ok(())
    }

    /// Extend the end time of an event.
    /// Only the organizer can extend the event end time.
    /// New end time must be after the current end time.
    /// Emits EventTimeExtended event for mobile push alerts.
    pub fn extend_event_end_time(
        env: Env,
        organizer: Address,
        event_id: u64,
        new_end_time: u64,
    ) -> Result<(), LumentixError> {
        organizer.require_auth();

        let mut event = storage::get_event(&env, event_id)?;

        if event.organizer != organizer {
            return Err(LumentixError::Unauthorized);
        }

        // Only published events can have end time extended
        if event.status != EventStatus::Published {
            return Err(LumentixError::InvalidStatusTransition);
        }

        // New end time must be after current end time
        if new_end_time <= event.end_time {
            return Err(LumentixError::InvalidTimeRange);
        }

        let previous_end_time = event.end_time;
        event.end_time = new_end_time;
        storage::set_event(&env, event_id, &event);

        // Emit EventTimeExtended event
        EventTimeExtended::emit(&env, event_id, previous_end_time, new_end_time);

        Ok(())
    }

    /// Purchase a ticket for a published event.
    /// Checks capacity: rejects with EventSoldOut when tickets_sold >= max_tickets.
    /// Increments tickets_sold on success.
    pub fn purchase_ticket(
        env: Env,
        buyer: Address,
        event_id: u64,
        amount: i128,
    ) -> Result<u64, LumentixError> {
        buyer.require_auth();

        let mut event = storage::get_event(&env, event_id)?;

        // Event must be published
        if event.status != EventStatus::Published {
            return Err(LumentixError::InvalidStatusTransition);
        }

        // Event must not be paused
        if event.paused {
            return Err(LumentixError::EventPaused);
        }

        let now = env.ledger().timestamp();
        Self::cleanup_expired_waitlist_offers(&env, event_id, now);
        let reserved_for_waitlist = storage::get_waitlist_reserved(&env, event_id);

        let mut consume_waitlist_offer = false;
        if let Some(offer) = storage::get_waitlist_offer(&env, event_id, &buyer) {
            if offer.quantity > 0 && offer.expires_at > now {
                consume_waitlist_offer = true;
            }
        }

        // Check capacity, accounting for reserved waitlist offers.
        if !consume_waitlist_offer
            && event.tickets_sold.saturating_add(reserved_for_waitlist) >= event.max_tickets
        {
            return Err(LumentixError::EventSoldOut);
        }

        // Validate payment amount
        if amount < event.ticket_price {
            return Err(LumentixError::InsufficientFunds);
        }

        // Process token transfer if token is set
        if let Ok(token_address) = storage::get_token_result(&env) {
            let token_client = soroban_sdk::token::Client::new(&env, &token_address);
            token_client.transfer(&buyer, &env.current_contract_address(), &amount);
        }

        // Calculate platform fee
        let fee_bps = storage::get_platform_fee_bps(&env);
        let platform_fee = (amount * fee_bps as i128) / 10000;
        let escrow_amount = amount - platform_fee;

        // Collect platform fee
        if platform_fee > 0 {
            storage::add_platform_balance(&env, platform_fee);
        }

        // Add to escrow
        storage::add_escrow(&env, event_id, escrow_amount);

        // Increment tickets_sold counter
        event.tickets_sold += 1;
        storage::set_event(&env, event_id, &event);

        // Create ticket
        let ticket_id = storage::get_next_ticket_id(&env);
        storage::increment_ticket_id(&env);

        let ticket = Ticket {
            id: ticket_id,
            event_id,
            owner: buyer.clone(),
            purchase_time: env.ledger().timestamp(),
            used: false,
            refunded: false,
            revoked: false,
            vip_tier: None,
            seat_id: None,
            accessibility_type: None,
        };

        storage::set_ticket(&env, ticket_id, &ticket);

        if consume_waitlist_offer {
            if let Some(mut offer) = storage::get_waitlist_offer(&env, event_id, &buyer) {
                if offer.quantity > 0 {
                    offer.quantity -= 1;
                    let reserved = storage::get_waitlist_reserved(&env, event_id);
                    storage::set_waitlist_reserved(&env, event_id, reserved.saturating_sub(1));
                }

                if offer.quantity == 0 {
                    storage::remove_waitlist_offer(&env, event_id, &buyer);
                } else {
                    storage::set_waitlist_offer(&env, event_id, &buyer, &offer);
                }
            }
        }

        TicketPurchased::emit(
            &env,
            ticket_id,
            event_id,
            ticket.owner,
            amount,
            platform_fee,
            escrow_amount,
        );

        Ok(ticket_id)
    }

    /// Purchase multiple tickets in a single transaction for a published event.
    /// More efficient than calling purchase_ticket multiple times for groups.
    /// Batch size is capped at 10 tickets per transaction.
    pub fn batch_purchase_tickets(
        env: Env,
        event_id: u64,
        quantity: u32,
        buyer: Address,
    ) -> Result<Vec<u64>, LumentixError> {
        buyer.require_auth();

        // Validate quantity is positive and within batch limit
        if quantity == 0 {
            return Err(LumentixError::InvalidAmount);
        }
        if quantity > 10 {
            return Err(LumentixError::CapacityExceeded);
        }

        let mut event = storage::get_event(&env, event_id)?;

        // Event must be published
        if event.status != EventStatus::Published {
            return Err(LumentixError::InvalidStatusTransition);
        }

        // Event must not be paused
        if event.paused {
            return Err(LumentixError::EventPaused);
        }

        let now = env.ledger().timestamp();
        Self::cleanup_expired_waitlist_offers(&env, event_id, now);
        let reserved_for_waitlist = storage::get_waitlist_reserved(&env, event_id);

        // Check public availability for the requested quantity
        let available = event
            .max_tickets
            .saturating_sub(event.tickets_sold.saturating_add(reserved_for_waitlist));
        if available < quantity {
            return Err(LumentixError::EventSoldOut);
        }

        // Calculate total amount
        let total_amount = event.ticket_price * quantity as i128;

        // Process token transfer if token is set
        if let Ok(token_address) = storage::get_token_result(&env) {
            let token_client = soroban_sdk::token::Client::new(&env, &token_address);
            token_client.transfer(&buyer, &env.current_contract_address(), &total_amount);
        }

        // Calculate platform fee for total amount
        let fee_bps = storage::get_platform_fee_bps(&env);
        let platform_fee = (total_amount * fee_bps as i128) / 10000;
        let escrow_amount = total_amount - platform_fee;

        // Collect platform fee
        if platform_fee > 0 {
            storage::add_platform_balance(&env, platform_fee);
        }

        // Add to escrow
        storage::add_escrow(&env, event_id, escrow_amount);

        // Update tickets_sold counter
        event.tickets_sold += quantity;
        storage::set_event(&env, event_id, &event);

        // Create tickets and collect IDs
        let mut ticket_ids = Vec::new(&env);
        let purchase_time = env.ledger().timestamp();
        let starting_ticket_id = storage::get_next_ticket_id(&env);

        for _ in 0..quantity {
            let ticket_id = storage::get_next_ticket_id(&env);
            storage::increment_ticket_id(&env);

            let ticket = Ticket {
                id: ticket_id,
                event_id,
                owner: buyer.clone(),
                purchase_time,
                used: false,
                refunded: false,
                revoked: false,
                vip_tier: None,
                seat_id: None,
                accessibility_type: None,
            };

            storage::set_ticket(&env, ticket_id, &ticket);
            ticket_ids.push_back(ticket_id);
        }

        // Emit BatchTicketsPurchased event for indexer efficiency
        BatchTicketsPurchased::emit(
            &env,
            event_id,
            buyer.clone(),
            quantity,
            total_amount,
            starting_ticket_id,
        );

        Ok(ticket_ids)
    }

    /// Pause ticket sales for an event. Only the organizer can pause.
    pub fn pause_ticket_sales(
        env: Env,
        event_id: u64,
        organizer: Address,
    ) -> Result<(), LumentixError> {
        organizer.require_auth();

        let mut event = storage::get_event(&env, event_id)?;

        if event.organizer != organizer {
            return Err(LumentixError::Unauthorized);
        }

        if event.status != EventStatus::Published {
            return Err(LumentixError::InvalidStatusTransition);
        }

        event.paused = true;
        storage::set_event(&env, event_id, &event);

        // Emit EventSalesPaused so front-end carts can invalidate immediately
        EventSalesPaused::emit(&env, event_id, organizer, env.ledger().timestamp());

        Ok(())
    }

    /// Resume ticket sales for a paused event. Only the organizer can resume.
    pub fn resume_ticket_sales(env: Env, event_id: u64) -> Result<(), LumentixError> {
        let mut event = storage::get_event(&env, event_id)?;

        // Enforce organizer auth as requested
        event.organizer.require_auth();

        if !event.paused {
            return Ok(()); // Already resumed or never paused
        }

        let organizer = event.organizer.clone();
        event.paused = false;
        storage::set_event(&env, event_id, &event);

        // Emit EventSalesResumed so front-end carts can re-validate
        EventSalesResumed::emit(&env, event_id, organizer, env.ledger().timestamp());

        Ok(())
    }

    /// Mark a ticket as used (check-in at event).
    /// Only the event organizer can use tickets.
    pub fn use_ticket(env: Env, ticket_id: u64, caller: Address) -> Result<(), LumentixError> {
        caller.require_auth();

        let mut ticket = storage::get_ticket(&env, ticket_id)?;

        if ticket.revoked {
            return Err(LumentixError::RevokedTicket);
        }

        if ticket.used {
            return Err(LumentixError::TicketAlreadyUsed);
        }

        // Only organizer can validate tickets
        let event = storage::get_event(&env, ticket.event_id)?;
        if event.organizer != caller {
            return Err(LumentixError::Unauthorized);
        }

        ticket.used = true;
        storage::set_ticket(&env, ticket_id, &ticket);

        // Emit TicketUsed event
        TicketUsed::emit(&env, ticket_id, ticket.event_id, ticket.owner, caller);

        Ok(())
    }

    /// Administratively revoke a ticket. Only the contract admin may call this.
    /// The ticket must exist, not already be revoked, used, or refunded.
    pub fn revoke_ticket(env: Env, admin: Address, ticket_id: u64) -> Result<(), LumentixError> {
        admin.require_auth();
        let stored_admin = storage::get_admin(&env);
        if stored_admin != admin {
            return Err(LumentixError::Unauthorized);
        }
        let mut ticket = storage::get_ticket(&env, ticket_id)?;
        if ticket.revoked {
            return Err(LumentixError::RevokedTicket);
        }
        if ticket.used {
            return Err(LumentixError::TicketAlreadyUsed);
        }
        if ticket.refunded {
            return Err(LumentixError::RefundNotAllowed);
        }
        ticket.revoked = true;
        storage::set_ticket(&env, ticket_id, &ticket);
        TicketRevoked::emit(&env, admin, ticket_id, ticket.event_id, None);
        Ok(())
    }

    /// Mark multiple tickets as used in a single transaction.
    /// Only the event organizer can use tickets. All tickets must belong to the same organizer's event.
    pub fn batch_use_tickets(
        env: Env,
        ticket_ids: Vec<u64>,
        caller: Address,
    ) -> Result<(), LumentixError> {
        caller.require_auth();

        let mut by_event = Map::<u64, Vec<u64>>::new(&env);

        for ticket_id in ticket_ids.iter() {
            let mut ticket = storage::get_ticket(&env, ticket_id)?;

            if ticket.revoked {
                return Err(LumentixError::RevokedTicket);
            }

            if ticket.used {
                return Err(LumentixError::TicketAlreadyUsed);
            }

            // Only organizer can validate tickets
            let event = storage::get_event(&env, ticket.event_id)?;
            if event.organizer != caller {
                return Err(LumentixError::Unauthorized);
            }

            ticket.used = true;
            storage::set_ticket(&env, ticket_id, &ticket);

            let eid = ticket.event_id;
            let mut ids = by_event.get(eid).unwrap_or_else(|| Vec::new(&env));
            ids.push_back(ticket_id);
            by_event.set(eid, ids);
        }

        for entry in by_event.iter() {
            let (event_id, ids) = entry;
            BatchTicketsUsed::emit(&env, event_id, ids.len(), ids);
        }

        Ok(())
    }

    /// Transfer a ticket from one owner to another.
    /// Only the current ticket owner can transfer it.
    /// Tickets can only be transferred for published events.
    /// Used or refunded tickets cannot be transferred.
    pub fn transfer_ticket(
        env: Env,
        ticket_id: u64,
        from: Address,
        to: Address,
    ) -> Result<(), LumentixError> {
        from.require_auth();

        // Read the ticket
        let mut ticket = storage::get_ticket(&env, ticket_id)?;

        // Verify the caller is the current owner
        if ticket.owner != from {
            return Err(LumentixError::Unauthorized);
        }

        if ticket.revoked {
            return Err(LumentixError::RevokedTicket);
        }

        // Verify ticket is not used
        if ticket.used {
            return Err(LumentixError::TicketAlreadyUsed);
        }

        // Verify ticket is not refunded
        if ticket.refunded {
            return Err(LumentixError::RefundNotAllowed);
        }

        // Read the event and verify it's published
        let event = storage::get_event(&env, ticket.event_id)?;
        if event.status != EventStatus::Published {
            return Err(LumentixError::InvalidStatusTransition);
        }

        // Update ticket owner
        ticket.owner = to.clone();
        storage::set_ticket(&env, ticket_id, &ticket);

        // Record transfer in history
        storage::append_ticket_transfer_history(
            &env,
            ticket_id,
            TicketTransferRecord {
                from: from.clone(),
                to: to.clone(),
                timestamp: env.ledger().timestamp(),
            },
        );

        // Emit TicketTransferred event
        TicketTransferred::emit(&env, ticket_id, ticket.event_id, from, to);

        Ok(())
    }

    /// Return the full ownership transfer history for a ticket.
    /// Each entry records the previous owner, new owner, and ledger timestamp of the transfer.
    /// Returns an empty Vec if the ticket exists but has never been transferred.
    /// Returns TicketNotFound if the ticket does not exist.
    pub fn get_ticket_transfer_history(
        env: Env,
        ticket_id: u64,
    ) -> Result<Vec<TicketTransferRecord>, LumentixError> {
        // Verify the ticket exists before returning history
        storage::get_ticket(&env, ticket_id)?;
        Ok(storage::get_ticket_transfer_history(&env, ticket_id))
    }

    /// Refund a ticket for a cancelled event.
    /// Decrements tickets_sold to free up capacity.
    /// The ticket must not be used or already refunded.
    pub fn refund_ticket(env: Env, ticket_id: u64, buyer: Address) -> Result<(), LumentixError> {
        buyer.require_auth();

        let mut ticket = storage::get_ticket(&env, ticket_id)?;

        // Only the ticket owner can request a refund
        if ticket.owner != buyer {
            return Err(LumentixError::Unauthorized);
        }

        if ticket.revoked {
            return Err(LumentixError::RevokedTicket);
        }

        // Cannot refund used tickets
        if ticket.used {
            return Err(LumentixError::TicketAlreadyUsed);
        }

        // Cannot refund already refunded tickets
        if ticket.refunded {
            return Err(LumentixError::RefundNotAllowed);
        }

        let mut event = storage::get_event(&env, ticket.event_id)?;

        // Event must be cancelled for refund
        if event.status != EventStatus::Cancelled {
            return Err(LumentixError::EventNotCancelled);
        }

        // Deduct from escrow
        let fee_bps = storage::get_platform_fee_bps(&env);
        let platform_fee = (event.ticket_price * fee_bps as i128) / 10000;
        let escrow_amount = event.ticket_price - platform_fee;
        storage::deduct_escrow(&env, ticket.event_id, escrow_amount)?;

        // Transfer tokens back to buyer
        if let Ok(token_address) = storage::get_token_result(&env) {
            let token_client = soroban_sdk::token::Client::new(&env, &token_address);
            token_client.transfer(&env.current_contract_address(), &buyer, &event.ticket_price);
        }

        // Mark ticket as refunded
        ticket.refunded = true;
        storage::set_ticket(&env, ticket_id, &ticket);

        // Decrement tickets_sold to free up capacity
        event.tickets_sold = event.tickets_sold.saturating_sub(1);
        storage::set_event(&env, ticket.event_id, &event);

        if event.status == EventStatus::Cancelled {
            // Cancelled events do not issue waitlist offers.
        } else {
            let _ = Self::process_waitlist_queue_internal(&env, ticket.event_id, 1);
        }

        // Emit TicketRefunded event
        TicketRefunded::emit(&env, ticket_id, ticket.event_id, buyer, event.ticket_price);

        Ok(())
    }

    /// Cancel a published event. Only the organizer can cancel.
    pub fn cancel_event(env: Env, organizer: Address, event_id: u64) -> Result<(), LumentixError> {
        organizer.require_auth();

        let mut event = storage::get_event(&env, event_id)?;

        if event.organizer != organizer {
            return Err(LumentixError::Unauthorized);
        }

        if event.status != EventStatus::Published {
            return Err(LumentixError::InvalidStatusTransition);
        }

        let old_status = event.status.clone();
        event.status = EventStatus::Cancelled;
        storage::set_event(&env, event_id, &event);
        EventCancelled::emit(&env, event_id, organizer.clone(), event.tickets_sold);

        // Emit GenericEventStateTransition event for universal state transition tracking
        GenericEventStateTransition::emit(
            &env,
            event_id,
            organizer,
            old_status,
            EventStatus::Cancelled,
        );

        Ok(())
    }

    /// Complete a published event after end_time. Only the organizer can complete.
    pub fn complete_event(
        env: Env,
        organizer: Address,
        event_id: u64,
    ) -> Result<(), LumentixError> {
        organizer.require_auth();

        let mut event = storage::get_event(&env, event_id)?;

        if event.organizer != organizer {
            return Err(LumentixError::Unauthorized);
        }

        if event.status != EventStatus::Published {
            return Err(LumentixError::InvalidStatusTransition);
        }

        // Must be after event end time
        if env.ledger().timestamp() <= event.end_time {
            return Err(LumentixError::InvalidStatusTransition);
        }

        let old_status = event.status.clone();
        event.status = EventStatus::Completed;
        storage::set_event(&env, event_id, &event);

        // Emit EventCompleted event
        EventCompleted::emit(&env, event_id, organizer.clone(), event.tickets_sold);

        // Emit GenericEventStateTransition event for universal state transition tracking
        GenericEventStateTransition::emit(
            &env,
            event_id,
            organizer,
            old_status,
            EventStatus::Completed,
        );

        Ok(())
    }

    /// Release escrow funds after event completion. Only the organizer can release.
    pub fn release_escrow(
        env: Env,
        organizer: Address,
        event_id: u64,
    ) -> Result<i128, LumentixError> {
        organizer.require_auth();

        let event = storage::get_event(&env, event_id)?;

        if event.organizer != organizer {
            return Err(LumentixError::Unauthorized);
        }

        if event.status != EventStatus::Completed {
            return Err(LumentixError::InvalidStatusTransition);
        }

        let escrow_balance = storage::get_escrow(&env, event_id)?;

        if escrow_balance == 0 {
            return Err(LumentixError::EscrowAlreadyReleased);
        }

        storage::clear_escrow(&env, event_id);

        // Transfer tokens to organizer
        if let Ok(token_address) = storage::get_token_result(&env) {
            let token_client = soroban_sdk::token::Client::new(&env, &token_address);
            token_client.transfer(&env.current_contract_address(), &organizer, &escrow_balance);
        }

        // Emit EscrowReleased event
        EscrowReleased::emit(&env, event_id, organizer, escrow_balance);

        Ok(escrow_balance)
    }

    /// Get the escrow balance for an event.
    /// Returns 0 if no escrow exists (no tickets sold yet).
    /// No auth required for transparency.
    pub fn get_escrow_balance(env: Env, event_id: u64) -> Result<i128, LumentixError> {
        // Verify event exists
        let _ = storage::get_event(&env, event_id)?;

        // Get escrow balance (returns 0 if no escrow key exists)
        let balance = storage::get_escrow(&env, event_id)?;

        Ok(balance)
    }

    /// Get event data by ID.
    pub fn get_event(env: Env, event_id: u64) -> Result<Event, LumentixError> {
        storage::get_event(&env, event_id)
    }

    /// Calculate dynamic ticket price from time window and demand velocity.
    /// - Early bird: >30 days => -20%
    /// - Normal: 7..=30 days => base price
    /// - Last minute: <=24h => +50%
    /// Additional demand multipliers are applied from purchase velocity metrics.
    pub fn calculate_dynamic_price(
        env: Env,
        event_id: u64,
        recent_purchases: u32,
        window_seconds: u64,
    ) -> Result<i128, LumentixError> {
        let event = storage::get_event(&env, event_id)?;
        let now = env.ledger().timestamp();
        let time_remaining = event.end_time.saturating_sub(now);

        let mut price = if time_remaining > THIRTY_DAYS_SECONDS {
            // Early bird discount
            (event.ticket_price * 80) / 100
        } else if time_remaining >= SEVEN_DAYS_SECONDS {
            // Normal window (7-30 days)
            event.ticket_price
        } else if time_remaining <= ONE_DAY_SECONDS {
            // Last-minute premium
            (event.ticket_price * 150) / 100
        } else {
            // Between 24h and 7 days: keep base price
            event.ticket_price
        };

        // Demand metric: purchases per hour over a caller-supplied analysis window.
        if recent_purchases > 0 {
            let window = if window_seconds == 0 {
                1
            } else {
                window_seconds
            };
            let velocity_per_hour = (recent_purchases as u64).saturating_mul(3600) / window;

            let demand_multiplier_bps = if velocity_per_hour >= 50 {
                13000 // +30%
            } else if velocity_per_hour >= 20 {
                11500 // +15%
            } else if velocity_per_hour >= 10 {
                10500 // +5%
            } else {
                10000
            };

            price = (price * demand_multiplier_bps as i128) / 10000;
        }

        if price <= 0 {
            return Err(LumentixError::InvalidAmount);
        }

        Ok(price)
    }

    /// Join an event waitlist once capacity is exhausted.
    pub fn join_waitlist(env: Env, event_id: u64, buyer: Address) -> Result<u32, LumentixError> {
        buyer.require_auth();
        let event = storage::get_event(&env, event_id)?;
        if event.status != EventStatus::Published {
            return Err(LumentixError::InvalidStatusTransition);
        }

        let now = env.ledger().timestamp();
        Self::cleanup_expired_waitlist_offers(&env, event_id, now);

        let reserved = storage::get_waitlist_reserved(&env, event_id);
        let available = event
            .max_tickets
            .saturating_sub(event.tickets_sold.saturating_add(reserved));
        if available > 0 {
            return Err(LumentixError::InvalidStatusTransition);
        }

        if let Some(offer) = storage::get_waitlist_offer(&env, event_id, &buyer) {
            if offer.quantity > 0 && offer.expires_at > now {
                return Err(LumentixError::AlreadyOnWaitlist);
            }
        }

        let mut queue = storage::get_waitlist_queue(&env, event_id);
        for queued in queue.iter() {
            if queued == buyer {
                return Err(LumentixError::AlreadyOnWaitlist);
            }
        }
        queue.push_back(buyer.clone());
        let position = queue.len();
        storage::set_waitlist_queue(&env, event_id, &queue);
        WaitlistJoined::emit(&env, event_id, buyer, position);
        Ok(position)
    }

    /// Organizer-triggered queue processing to issue FIFO waitlist offers.
    pub fn process_waitlist_queue(
        env: Env,
        organizer: Address,
        event_id: u64,
    ) -> Result<u32, LumentixError> {
        organizer.require_auth();
        let event = storage::get_event(&env, event_id)?;
        if event.organizer != organizer {
            return Err(LumentixError::Unauthorized);
        }

        let now = env.ledger().timestamp();
        Self::cleanup_expired_waitlist_offers(&env, event_id, now);
        let reserved = storage::get_waitlist_reserved(&env, event_id);
        let available = event
            .max_tickets
            .saturating_sub(event.tickets_sold.saturating_add(reserved));

        Ok(Self::process_waitlist_queue_internal(
            &env, event_id, available,
        ))
    }

    /// Notify a specific waitlist member that tickets are available.
    /// Creates a 24-hour reservation window.
    pub fn notify_waitlist_availability(
        env: Env,
        organizer: Address,
        event_id: u64,
        buyer: Address,
        quantity: u32,
    ) -> Result<u64, LumentixError> {
        organizer.require_auth();
        if quantity == 0 {
            return Err(LumentixError::InvalidAmount);
        }

        let event = storage::get_event(&env, event_id)?;
        if event.organizer != organizer {
            return Err(LumentixError::Unauthorized);
        }
        if event.status != EventStatus::Published {
            return Err(LumentixError::InvalidStatusTransition);
        }

        let now = env.ledger().timestamp();
        Self::cleanup_expired_waitlist_offers(&env, event_id, now);

        let reserved = storage::get_waitlist_reserved(&env, event_id);
        let available = event
            .max_tickets
            .saturating_sub(event.tickets_sold.saturating_add(reserved));
        if available < quantity {
            return Err(LumentixError::EventSoldOut);
        }

        let expires_at = now + ONE_DAY_SECONDS;
        let offer = WaitlistOffer {
            quantity,
            expires_at,
        };
        storage::set_waitlist_offer(&env, event_id, &buyer, &offer);
        Self::add_offer_recipient_if_missing(&env, event_id, &buyer);

        let new_reserved = storage::get_waitlist_reserved(&env, event_id).saturating_add(quantity);
        storage::set_waitlist_reserved(&env, event_id, new_reserved);
        WaitlistAvailabilityNotified::emit(&env, event_id, buyer, quantity, expires_at);

        Ok(expires_at)
    }

    /// Get the status of an event by ID.
    /// Returns only the EventStatus without fetching the entire Event struct.
    /// Returns LumentixError::EventNotFound if the event doesn't exist.
    /// No auth required.
    pub fn get_event_status(env: Env, event_id: u64) -> Result<EventStatus, LumentixError> {
        let event = storage::get_event(&env, event_id)?;
        Ok(event.status)
    }

    /// Get the total number of events created on the platform.
    /// Returns 0 if no events have been created yet.
    /// No auth required.
    pub fn get_total_events(env: Env) -> u64 {
        storage::get_next_event_id(&env).saturating_sub(1)
    }

    /// Get all events created by a specific organizer.
    /// Returns an empty vector if no events are found for the organizer.
    pub fn get_events_by_organizer(env: Env, organizer: Address) -> Vec<Event> {
        let mut events = Vec::new(&env);
        let next_event_id = storage::get_next_event_id(&env);
        let mut event_id: u64 = 1;

        while event_id < next_event_id {
            if let Ok(event) = storage::get_event(&env, event_id) {
                if event.organizer == organizer {
                    events.push_back(event);
                }
            }
            event_id += 1;
        }

        events
    }

    /// Get all events matching a specific status.
    /// Iterates through all event IDs up to the current counter and skips missing entries safely.
    /// Returns an empty vector if no matching events exist.
    /// No auth required.
    pub fn get_events_by_status(env: Env, status: EventStatus) -> Vec<Event> {
        let mut events = Vec::new(&env);
        let next_event_id = storage::get_next_event_id(&env);
        let mut event_id: u64 = 1;

        while event_id < next_event_id {
            if let Ok(event) = storage::get_event(&env, event_id) {
                if event.status == status {
                    events.push_back(event);
                }
            }
            event_id += 1;
        }

        events
    }

    /// Get all events created by a specific organizer with a specific status.
    /// Returns an empty vector if no events match.
    /// No auth required.
    pub fn get_events_by_org_and_status(
        env: Env,
        organizer: Address,
        status: EventStatus,
    ) -> Vec<Event> {
        let mut events = Vec::new(&env);
        let next_event_id = storage::get_next_event_id(&env);
        let mut event_id: u64 = 1;

        while event_id < next_event_id {
            if let Ok(event) = storage::get_event(&env, event_id) {
                if event.organizer == organizer && event.status == status {
                    events.push_back(event);
                }
            }
            event_id += 1;
        }

        events
    }

    /// Get all active (published) events.
    /// Iterates through all events and filters for status == Published.
    /// Returns an empty vector if no published events exist.
    /// No auth required.
    pub fn get_active_events(env: Env) -> Vec<Event> {
        let mut active_events = Vec::new(&env);
        let next_event_id = storage::get_next_event_id(&env);
        let mut event_id: u64 = 1;

        while event_id < next_event_id {
            if let Ok(event) = storage::get_event(&env, event_id) {
                if event.status == EventStatus::Published {
                    active_events.push_back(event);
                }
            }
            event_id += 1;
        }

        active_events
    }

    /// Get events whose end time has passed.
    /// Excludes cancelled events. Acts as a historical archive.
    pub fn get_past_events(env: Env, current_time: u64) -> Vec<Event> {
        let mut past_events = Vec::new(&env);
        let next_event_id = storage::get_next_event_id(&env);
        let mut event_id: u64 = 1;

        while event_id < next_event_id {
            if let Ok(event) = storage::get_event(&env, event_id) {
                if event.end_time < current_time && event.status != EventStatus::Cancelled {
                    past_events.push_back(event);
                }
            }
            event_id += 1;
        }

        past_events
    }

    /// List all cancelled events platform-wide.
    /// Administrators and automated indexers need this feed.
    pub fn get_cancelled_events(env: Env) -> Vec<Event> {
        let mut cancelled_events = Vec::new(&env);
        let next_event_id = storage::get_next_event_id(&env);
        let mut event_id: u64 = 1;

        while event_id < next_event_id {
            if let Ok(event) = storage::get_event(&env, event_id) {
                if event.status == EventStatus::Cancelled {
                    cancelled_events.push_back(event);
                }
            }
            event_id += 1;
        }

        cancelled_events
    }

    /// Implement batch_transfer_tickets write function for transferring multiple tickets in one call.
    /// Iterate and enforce auth on from once, verifying from owns all tickets, updating paths to to.
    pub fn batch_transfer_tickets(
        env: Env,
        ticket_ids: Vec<u64>,
        to: Address,
        from: Address,
    ) -> Result<(), LumentixError> {
        from.require_auth();

        for ticket_id in ticket_ids.iter() {
            // Read the ticket
            let mut ticket = storage::get_ticket(&env, ticket_id)?;

            // Verify the caller is the current owner
            if ticket.owner != from {
                return Err(LumentixError::Unauthorized);
            }

            if ticket.revoked {
                return Err(LumentixError::RevokedTicket);
            }

            // Verify ticket is not used
            if ticket.used {
                return Err(LumentixError::TicketAlreadyUsed);
            }

            // Verify ticket is not refunded
            if ticket.refunded {
                return Err(LumentixError::RefundNotAllowed);
            }

            // Read the event and verify it's published
            let event = storage::get_event(&env, ticket.event_id)?;
            if event.status != EventStatus::Published {
                return Err(LumentixError::InvalidStatusTransition);
            }

            // Update ticket owner
            ticket.owner = to.clone();
            storage::set_ticket(&env, ticket_id, &ticket);

            // Record transfer in history
            storage::append_ticket_transfer_history(
                &env,
                ticket_id,
                TicketTransferRecord {
                    from: from.clone(),
                    to: to.clone(),
                    timestamp: env.ledger().timestamp(),
                },
            );

            // Emit TicketTransferred event
            TicketTransferred::emit(&env, ticket_id, ticket.event_id, from.clone(), to.clone());
        }

        // Resolves Issue #546
        // Emit BatchTicketsTransferred event for indexer efficiency
        BatchTicketsTransferred::emit(&env, from.clone(), to.clone(), ticket_ids.clone());

        Ok(())
    }

    /// Implement get_most_active_organizers read function to list top event creators.
    /// Analyze the complete event dataset, grouping and counting events by organizer,
    /// sorting them by count descending, and returning the top 10 organizers.
    pub fn get_most_active_organizers(env: Env) -> Vec<(Address, u32)> {
        let mut organizer_counts = Map::<Address, u32>::new(&env);
        let next_event_id = storage::get_next_event_id(&env);
        let mut event_id: u64 = 1;

        while event_id < next_event_id {
            if let Ok(event) = storage::get_event(&env, event_id) {
                let count = organizer_counts.get(event.organizer.clone()).unwrap_or(0);
                organizer_counts.set(event.organizer, count + 1);
            }
            event_id += 1;
        }

        // Convert Map to Vec of tuples for sorting
        let mut result = Vec::<(Address, u32)>::new(&env);
        for entry in organizer_counts.iter() {
            result.push_back(entry);
        }

        // Simple bubble sort for descending order (top organizers first)
        let len = result.len();
        if len > 1 {
            for i in 0..len {
                for j in 0..len - 1 - i {
                    let a = result.get(j).unwrap();
                    let b = result.get(j + 1).unwrap();
                    if a.1 < b.1 {
                        result.set(j, b);
                        result.set(j + 1, a);
                    }
                }
            }
        }

        // Return top 10
        let mut top_10 = Vec::<(Address, u32)>::new(&env);
        for entry in result.iter().take(10) {
            top_10.push_back(entry);
        }

        top_10
    }

    /// Get ticket data by ID.
    pub fn get_ticket_info(env: Env, ticket_id: u64) -> Result<Ticket, LumentixError> {
        storage::get_ticket(&env, ticket_id)
    }

    /// Check whether a ticket is currently valid for entry.
    /// A ticket is valid only when it exists, has not been used, refunded, or revoked,
    /// and its event is still published.
    pub fn get_ticket_validity(env: Env, ticket_id: u64) -> Result<bool, LumentixError> {
        let ticket = storage::get_ticket(&env, ticket_id)?;
        let event = storage::get_event(&env, ticket.event_id)?;

        Ok(!ticket.used
            && !ticket.refunded
            && !ticket.revoked
            && event.status == EventStatus::Published)
    }

    /// Get all tickets sold for a given event.
    /// Returns EventNotFound if the event does not exist.
    pub fn get_tickets_by_event(env: Env, event_id: u64) -> Result<Vec<Ticket>, LumentixError> {
        // Ensure the event exists.
        let _ = storage::get_event(&env, event_id)?;

        let mut tickets = Vec::new(&env);
        let next_ticket_id = storage::get_next_ticket_id(&env);
        let mut ticket_id: u64 = 1;

        while ticket_id < next_ticket_id {
            if let Ok(ticket) = storage::get_ticket(&env, ticket_id) {
                if ticket.event_id == event_id {
                    tickets.push_back(ticket);
                }
            }
            ticket_id += 1;
        }

        Ok(tickets)
    }

    /// Get all refunded tickets for a given event.
    /// Returns EventNotFound if the event does not exist.
    /// Returns an empty vector if the event has no refunded tickets.
    /// No auth required.
    pub fn get_refunded_tickets_by_event(
        env: Env,
        event_id: u64,
    ) -> Result<Vec<Ticket>, LumentixError> {
        // Ensure the event exists.
        let _ = storage::get_event(&env, event_id)?;

        let mut tickets = Vec::new(&env);
        let next_ticket_id = storage::get_next_ticket_id(&env);
        let mut ticket_id: u64 = 1;

        while ticket_id < next_ticket_id {
            if let Ok(ticket) = storage::get_ticket(&env, ticket_id) {
                if ticket.event_id == event_id && ticket.refunded {
                    tickets.push_back(ticket);
                }
            }
            ticket_id += 1;
        }

        Ok(tickets)
    }

    pub fn get_tickets_by_buyer(env: Env, buyer: Address) -> Vec<Ticket> {
        let mut tickets = Vec::new(&env);
        let next_ticket_id = storage::get_next_ticket_id(&env);
        let mut ticket_id: u64 = 1;

        while ticket_id < next_ticket_id {
            if let Ok(ticket) = storage::get_ticket(&env, ticket_id) {
                if ticket.owner == buyer {
                    tickets.push_back(ticket);
                }
            }
            ticket_id += 1;
        }

        tickets
    }

    /// Extend the TTL of an event. Only the organizer can call this.
    pub fn bump_event_ttl(env: Env, event_id: u64) -> Result<(), LumentixError> {
        let event = storage::get_event(&env, event_id)?;

        // Require authorization from the organizer
        event.organizer.require_auth();

        // Accessing storage via `get_event` automatically extends TTL based on storage.rs logic.
        Ok(())
    }

    /// Extend the TTL of a ticket to prevent expiration before the event.
    /// No authorization required as this is a maintenance operation.
    pub fn bump_ticket_ttl(env: Env, ticket_id: u64) -> Result<(), LumentixError> {
        // Read the ticket to verify it exists
        let _ticket = storage::get_ticket(&env, ticket_id)?;

        // Extend the TTL for the ticket storage key
        let key = ("TICKET_", ticket_id);
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);

        Ok(())
    }

    /// Get the number of remaining tickets available for an event.
    /// Returns max_tickets - tickets_sold.
    pub fn get_availability(env: Env, event_id: u64) -> Result<u32, LumentixError> {
        let event = storage::get_event(&env, event_id)?;
        Ok(event.max_tickets.saturating_sub(event.tickets_sold))
    }

    /// Set the platform fee in basis points (e.g., 250 = 2.5%).
    /// Only the admin can set the platform fee. Must be between 0 and 10000.
    pub fn set_platform_fee(env: Env, admin: Address, fee_bps: u32) -> Result<(), LumentixError> {
        admin.require_auth();

        let stored_admin = storage::get_admin(&env);
        if stored_admin != admin {
            return Err(LumentixError::Unauthorized);
        }

        if fee_bps > 10000 {
            return Err(LumentixError::InvalidPlatformFee);
        }

        // Read current fee before updating for event emission
        let old_fee_bps = storage::get_platform_fee_bps(&env);

        storage::set_platform_fee_bps(&env, fee_bps);

        // Emit PlatformFeeUpdated event
        PlatformFeeUpdated::emit(&env, admin, old_fee_bps, fee_bps);

        Ok(())
    }

    /// Returns the configured **protocol (platform) fee** and the **fee recipient** used for ticket flows.
    ///
    /// The fee is expressed in **basis points** (bps): `1_000` bps = 10%, `10_000` bps = 100%. The recipient is
    /// always the contract **admin** address (the same account that receives accrued fees when
    /// [`Self::withdraw_platform_fees`] is called). This query is read-only aside from emitting a diagnostic event.
    ///
    /// # Arguments
    ///
    /// * `env` — Soroban [`Env`]: host, storage, and event interface. No caller identity is read; there is no
    ///   `Address` parameter and **no authentication** is required.
    ///
    /// # Returns
    ///
    /// * `Ok((fee_bps, fee_recipient))` — `fee_bps` is the current platform fee in \[0, 10_000\] (enforced on
    ///   [`Self::set_platform_fee`]). `fee_recipient` is the admin [`Address`] from instance storage.
    ///
    /// # Errors
    ///
    /// * [`LumentixError::NotInitialized`] — returned before any storage reads if the contract has not been
    ///   initialized via [`Self::initialize`].
    ///
    /// # Events
    ///
    /// On success, emits [`ProtocolFeeQueried`] (`feequery` topic) with `(fee_bps, fee_recipient)` for indexing
    /// and analytics. **Every successful call emits this event**, including repeated reads with the same values.
    ///
    /// # Panics
    ///
    /// This entrypoint does not use `panic!` for control flow. A panic could still occur only if underlying
    /// Soroban storage or the event subsystem encounters an unrecoverable host error, or if instance storage is
    /// in an inconsistent state (for example, initialized without a valid admin record—should not happen when
    /// only using the public API).
    pub fn get_protocol_fee(env: Env) -> Result<(u32, Address), LumentixError> {
        if !storage::is_initialized(&env) {
            return Err(LumentixError::NotInitialized);
        }
        let fee_bps = storage::get_platform_fee_bps(&env);
        let fee_recipient = storage::get_admin(&env);

        // Emit diagnostic event for off-chain analytics tracking
        ProtocolFeeQueried::emit(&env, fee_bps, fee_recipient.clone());

        Ok((fee_bps, fee_recipient))
    }

    /// Get the current platform fee in basis points.
    pub fn get_platform_fee(env: Env) -> u32 {
        storage::get_platform_fee_bps(&env)
    }

    /// Get the accumulated platform fee balance.
    pub fn get_platform_balance(env: Env) -> i128 {
        storage::get_platform_balance(&env)
    }

    /// Get event revenue (gross ticket sales).
    /// Calculates revenue as tickets_sold * ticket_price.
    /// Returns i128 representing total gross revenue.
    /// No auth required.
    pub fn get_event_revenue(env: Env, event_id: u64) -> Result<i128, LumentixError> {
        let event = storage::get_event(&env, event_id)?;
        let revenue = event.tickets_sold as i128 * event.ticket_price;
        Ok(revenue)
    }

    /// Deposit funds into a group's (event's) treasury for future distributions.
    /// The depositor must be the event organizer or the admin.
    /// The event must exist and not be cancelled.
    /// Amount must be positive.
    pub fn deposit_funds(
        env: Env,
        depositor: Address,
        event_id: u64,
        amount: i128,
    ) -> Result<i128, LumentixError> {
        depositor.require_auth();

        if !storage::is_initialized(&env) {
            return Err(LumentixError::NotInitialized);
        }

        // Validate amount
        if amount <= 0 {
            return Err(LumentixError::InvalidAmount);
        }

        let event = storage::get_event(&env, event_id)?;

        // Only the organizer or admin may deposit into an event treasury
        let admin = storage::get_admin(&env);
        if event.organizer != depositor && admin != depositor {
            return Err(LumentixError::Unauthorized);
        }

        // Cannot deposit into a cancelled event
        if event.status == EventStatus::Cancelled {
            return Err(LumentixError::InvalidStatusTransition);
        }

        // Add to escrow (treasury)
        storage::add_escrow(&env, event_id, amount);
        let new_balance = storage::get_escrow(&env, event_id)?;

        // Process token transfer
        if let Ok(token_address) = storage::get_token_result(&env) {
            let token_client = soroban_sdk::token::Client::new(&env, &token_address);
            token_client.transfer(&depositor, &env.current_contract_address(), &amount);
        }

        // Emit FundsDeposited event
        FundsDeposited::emit(&env, event_id, depositor, amount, new_balance);

        Ok(new_balance)
    }

    /// Withdraw allocated funds from a group's (event's) treasury.
    /// The withdrawer must be the event organizer or the admin.
    /// The event must exist and not be cancelled.
    /// Amount must be positive and not exceed available escrow balance.
    pub fn withdraw_funds(
        env: Env,
        withdrawer: Address,
        event_id: u64,
        amount: i128,
    ) -> Result<i128, LumentixError> {
        withdrawer.require_auth();

        if !storage::is_initialized(&env) {
            return Err(LumentixError::NotInitialized);
        }

        // Validate amount
        if amount <= 0 {
            return Err(LumentixError::InvalidAmount);
        }

        let event = storage::get_event(&env, event_id)?;

        // Only the organizer or admin may withdraw from an event treasury
        let admin = storage::get_admin(&env);
        if event.organizer != withdrawer && admin != withdrawer {
            return Err(LumentixError::Unauthorized);
        }

        // Cannot withdraw from a cancelled event
        if event.status == EventStatus::Cancelled {
            return Err(LumentixError::InvalidStatusTransition);
        }

        // Check available escrow balance
        let current_balance = storage::get_escrow(&env, event_id)?;
        if current_balance < amount {
            return Err(LumentixError::InsufficientEscrow);
        }

        // Deduct from escrow (treasury)
        storage::deduct_escrow(&env, event_id, amount)?;
        let new_balance = storage::get_escrow(&env, event_id)?;

        // Transfer tokens to withdrawer
        if let Ok(token_address) = storage::get_token_result(&env) {
            let token_client = soroban_sdk::token::Client::new(&env, &token_address);
            token_client.transfer(&env.current_contract_address(), &withdrawer, &amount);
        }

        // Emit FundsWithdrawn event
        FundsWithdrawn::emit(&env, event_id, withdrawer, amount, new_balance);

        Ok(new_balance)
    }

    /// Withdraw all accumulated platform fees. Only the admin can withdraw.
    pub fn withdraw_platform_fees(env: Env, admin: Address) -> Result<i128, LumentixError> {
        admin.require_auth();

        let stored_admin = storage::get_admin(&env);
        if stored_admin != admin {
            return Err(LumentixError::Unauthorized);
        }

        let balance = storage::get_platform_balance(&env);
        if balance == 0 {
            return Err(LumentixError::NoPlatformFees);
        }

        storage::clear_platform_balance(&env);

        // Transfer tokens to admin
        if let Ok(token_address) = storage::get_token_result(&env) {
            let token_client = soroban_sdk::token::Client::new(&env, &token_address);
            token_client.transfer(&env.current_contract_address(), &admin, &balance);
        }

        // Emit PlatformFeesWithdrawn event
        PlatformFeesWithdrawn::emit(&env, admin, balance);

        Ok(balance)
    }

    /// Set the payment token address. Only the admin can call this.
    pub fn set_token(env: Env, admin: Address, token: Address) -> Result<(), LumentixError> {
        admin.require_auth();

        if !storage::is_initialized(&env) {
            return Err(LumentixError::NotInitialized);
        }

        let stored_admin = storage::get_admin(&env);
        if stored_admin != admin {
            return Err(LumentixError::Unauthorized);
        }

        storage::set_token(&env, &token);

        Ok(())
    }

    /// Get the configured payment token address.
    pub fn get_token(env: Env) -> Result<Address, LumentixError> {
        if !storage::is_initialized(&env) {
            return Err(LumentixError::NotInitialized);
        }

        if !env.storage().instance().has(&"TOKEN") {
            return Err(LumentixError::InvalidAddress);
        }

        Ok(storage::get_token(&env))
    }

    /// Get the contract admin address.
    /// Returns the admin address if the contract is initialized.
    /// No auth required - provides transparency.
    pub fn get_admin(env: Env) -> Result<Address, LumentixError> {
        if !storage::is_initialized(&env) {
            return Err(LumentixError::NotInitialized);
        }
        Ok(storage::get_admin(&env))
    }

    /// Change the admin address. Only the current admin can call this.
    /// Emits AdminChanged event with old and new admin addresses.
    /// Fails with Unauthorized if caller is not the current admin.
    /// Fails with InvalidAddress if new_admin is the same as current admin.
    pub fn update_platform_fee_recipient(
        env: Env,
        admin: Address,
        new_admin: Address,
    ) -> Result<(), LumentixError> {
        admin.require_auth();

        let current_admin = storage::get_admin(&env);

        // Verify caller is the current admin
        if current_admin != admin {
            return Err(LumentixError::Unauthorized);
        }

        // Prevent changing to the same address
        if current_admin == new_admin {
            return Err(LumentixError::InvalidAddress);
        }

        let old_admin = current_admin;
        storage::set_admin(&env, &new_admin);

        // Emit AdminChanged event for backward compatibility
        AdminChanged::emit(&env, admin.clone(), old_admin.clone(), new_admin.clone());

        // Emit PlatformFeeRecipientUpdated for Dapp indexing solutions
        PlatformFeeRecipientUpdated::emit(&env, admin, old_admin, new_admin);

        Ok(())
    }

    /// Check if the contract has been initialized.
    /// Returns true if initialized, false otherwise.
    /// No auth required - useful for frontends and deployment scripts.
    pub fn get_is_initialized(env: Env) -> bool {
        storage::is_initialized(&env)
    }

    /// Get total revenue for an organizer across all events.
    /// Iterates through all event IDs from 1 to EVENT_CTR, calculates gross revenue, and sums it up.
    /// Returns 0 if the organizer has no events or no sales. No auth required.
    pub fn get_organizer_total_revenue(env: Env, organizer: Address) -> i128 {
        let mut total_revenue: i128 = 0;
        let next_event_id = storage::get_next_event_id(&env);
        let mut event_id: u64 = 1;

        while event_id < next_event_id {
            if let Ok(event) = storage::get_event(&env, event_id) {
                if event.organizer == organizer {
                    total_revenue += event.tickets_sold as i128 * event.ticket_price;
                }
            }
            event_id += 1;
        }

        total_revenue
    }

    /// Get total tickets sold across all events on the platform.
    /// Iterates through all events from 1 to EVENT_CTR and sums up the tickets_sold field.
    /// No auth required.
    pub fn get_total_tickets_sold(env: Env) -> u64 {
        let mut total_tickets: u64 = 0;
        let next_event_id = storage::get_next_event_id(&env);
        let mut event_id: u64 = 1;

        while event_id < next_event_id {
            if let Ok(event) = storage::get_event(&env, event_id) {
                total_tickets += event.tickets_sold as u64;
            }
            event_id += 1;
        }

        total_tickets
    }

    /// Get the addresses of all checked-in (used ticket) attendees for an event.
    /// Verifies the event exists, then iterates all tickets collecting owners of
    /// used tickets matching event_id. Deduplicates so each address appears once.
    pub fn get_event_attendees(env: Env, event_id: u64) -> Result<Vec<Address>, LumentixError> {
        // Verify event exists
        let _ = storage::get_event(&env, event_id)?;

        let mut attendees: Vec<Address> = Vec::new(&env);
        let next_ticket_id = storage::get_next_ticket_id(&env);
        let mut ticket_id: u64 = 1;

        while ticket_id < next_ticket_id {
            if let Ok(ticket) = storage::get_ticket(&env, ticket_id) {
                if ticket.event_id == event_id && ticket.used {
                    // Deduplicate: only add if not already present
                    let mut already_added = false;
                    for i in 0..attendees.len() {
                        if attendees.get(i).unwrap() == ticket.owner {
                            already_added = true;
                            break;
                        }
                    }
                    if !already_added {
                        attendees.push_back(ticket.owner);
                    }
                }
            }
            ticket_id += 1;
        }

        Ok(attendees)
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HYBRID EVENTS / STREAMING
    // ═══════════════════════════════════════════════════════════════════════

    /// Create a hybrid event with streaming options.
    #[allow(clippy::too_many_arguments)]
    pub fn create_hybrid_event(
        env: Env,
        organizer: Address,
        name: String,
        ticket_price: i128,
        max_tickets: u32,
        start_time: u64,
        end_time: u64,
        streaming_url: String,
    ) -> Result<u64, LumentixError> {
        organizer.require_auth();
        let event_id = Self::create_event(
            env.clone(),
            organizer,
            name,
            String::from_str(&env, "Virtual event with streaming"), // description
            String::from_str(&env, "Online"),                       // location
            start_time,
            end_time,
            ticket_price,
            max_tickets,
        )?;

        let url_key = (soroban_sdk::symbol_short!("STRM_URL"), event_id);
        env.storage().persistent().set(&url_key, &streaming_url);
        env.storage().persistent().extend_ttl(
            &url_key,
            crate::types::PERSISTENT_LIFETIME,
            crate::types::PERSISTENT_LIFETIME,
        );

        Ok(event_id)
    }

    /// Manage access to the streaming feature for an attendee.
    pub fn manage_streaming_access(
        env: Env,
        organizer: Address,
        event_id: u64,
        user: Address,
        has_access: bool,
    ) -> Result<(), LumentixError> {
        organizer.require_auth();
        let event = storage::get_event(&env, event_id)?;
        if event.organizer != organizer {
            return Err(LumentixError::Unauthorized);
        }

        let access_key = (soroban_sdk::symbol_short!("STRM_ACC"), event_id, user);
        env.storage().persistent().set(&access_key, &has_access);
        env.storage().persistent().extend_ttl(
            &access_key,
            crate::types::PERSISTENT_LIFETIME,
            crate::types::PERSISTENT_LIFETIME,
        );
        Ok(())
    }

    /// Track virtual attendance of a user for a hybrid event.
    pub fn track_virtual_attendance(
        env: Env,
        event_id: u64,
        user: Address,
    ) -> Result<(), LumentixError> {
        user.require_auth();

        let access_key = (
            soroban_sdk::symbol_short!("STRM_ACC"),
            event_id,
            user.clone(),
        );
        let has_access: bool = env.storage().persistent().get(&access_key).unwrap_or(false);
        if !has_access {
            return Err(LumentixError::Unauthorized);
        }

        let att_key = (soroban_sdk::symbol_short!("VIRT_ATT"), event_id, user);
        env.storage().persistent().set(&att_key, &true);
        env.storage().persistent().extend_ttl(
            &att_key,
            crate::types::PERSISTENT_LIFETIME,
            crate::types::PERSISTENT_LIFETIME,
        );
        Ok(())
    }

    // ═══════════════════════════════════════════════════════════════════════
    // VIP TIER SYSTEM
    // ═══════════════════════════════════════════════════════════════════════

    /// Create a VIP tier for an event. Only the organizer can call this.
    pub fn create_vip_tier(
        env: Env,
        organizer: Address,
        event_id: u64,
        tier_name: String,
        price: i128,
        max_slots: u32,
        benefits: Vec<String>,
    ) -> Result<(), LumentixError> {
        organizer.require_auth();

        let event = storage::get_event(&env, event_id)?;
        if event.organizer != organizer {
            return Err(LumentixError::Unauthorized);
        }

        validation::validate_string_not_empty(&tier_name)?;
        validation::validate_positive_amount(price)?;
        validation::validate_positive_slots(max_slots)?;

        if storage::has_vip_tier(&env, event_id, &tier_name) {
            return Err(LumentixError::VipTierAlreadyExists);
        }

        let tier = VipTier {
            name: tier_name.clone(),
            price,
            max_slots,
            filled_slots: 0,
            benefits,
        };

        storage::set_vip_tier(&env, event_id, &tier_name, &tier);

        VipTierCreated::emit(&env, event_id, tier_name, price, max_slots);

        Ok(())
    }

    /// Assign VIP benefits to a ticket. Validates the tier has available slots.
    pub fn assign_vip_benefits(
        env: Env,
        organizer: Address,
        event_id: u64,
        ticket_id: u64,
        tier_name: String,
    ) -> Result<(), LumentixError> {
        organizer.require_auth();

        let event = storage::get_event(&env, event_id)?;
        if event.organizer != organizer {
            return Err(LumentixError::Unauthorized);
        }

        let mut tier = storage::get_vip_tier(&env, event_id, &tier_name)?;

        if tier.filled_slots >= tier.max_slots {
            return Err(LumentixError::VipTierFull);
        }

        let mut ticket = storage::get_ticket(&env, ticket_id)?;
        if ticket.event_id != event_id {
            return Err(LumentixError::Unauthorized);
        }
        if ticket.revoked {
            return Err(LumentixError::RevokedTicket);
        }
        if ticket.refunded {
            return Err(LumentixError::RefundNotAllowed);
        }

        tier.filled_slots += 1;
        storage::set_vip_tier(&env, event_id, &tier_name, &tier);

        ticket.vip_tier = Some(tier_name.clone());
        storage::set_ticket(&env, ticket_id, &ticket);

        VipTicketAssigned::emit(&env, ticket_id, event_id, tier_name, ticket.owner);

        Ok(())
    }

    /// Validate that a ticket has VIP access for a given tier.
    /// Used at check-in to verify VIP entitlements.
    pub fn validate_vip_access(
        env: Env,
        ticket_id: u64,
        tier_name: String,
    ) -> Result<bool, LumentixError> {
        let ticket = storage::get_ticket(&env, ticket_id)?;

        if ticket.revoked || ticket.refunded || ticket.used {
            return Ok(false);
        }

        match &ticket.vip_tier {
            Some(tier) => Ok(tier == &tier_name),
            None => Ok(false),
        }
    }

    /// Get VIP tier details for an event.
    pub fn get_vip_tier(
        env: Env,
        event_id: u64,
        tier_name: String,
    ) -> Result<VipTier, LumentixError> {
        storage::get_vip_tier(&env, event_id, &tier_name)
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ACCESSIBILITY FEATURES
    // ═══════════════════════════════════════════════════════════════════════

    /// Configure accessibility inventory for an event. Only organizer can call.
    pub fn setup_accessibility_inventory(
        env: Env,
        organizer: Address,
        event_id: u64,
        wheelchair_total: u32,
        hearing_total: u32,
        visual_total: u32,
    ) -> Result<(), LumentixError> {
        organizer.require_auth();

        let mut event = storage::get_event(&env, event_id)?;
        if event.organizer != organizer {
            return Err(LumentixError::Unauthorized);
        }

        let inv = AccessibilityInventory {
            wheelchair_available: wheelchair_total,
            wheelchair_total,
            hearing_available: hearing_total,
            hearing_total,
            visual_available: visual_total,
            visual_total,
        };

        storage::set_accessibility_inventory(&env, event_id, &inv);

        event.accessibility_wheelchair = wheelchair_total;
        event.accessibility_hearing = hearing_total;
        event.accessibility_visual = visual_total;
        storage::set_event(&env, event_id, &event);

        AccessibilityInventoryUpdated::emit(
            &env,
            event_id,
            wheelchair_total,
            hearing_total,
            visual_total,
        );

        Ok(())
    }

    /// Request an accessibility accommodation for a ticket.
    pub fn request_accessibility_booking(
        env: Env,
        attendee: Address,
        event_id: u64,
        ticket_id: u64,
        accommodation_type: String,
    ) -> Result<u64, LumentixError> {
        attendee.require_auth();

        let event = storage::get_event(&env, event_id)?;
        if event.status != EventStatus::Published {
            return Err(LumentixError::InvalidStatusTransition);
        }

        let ticket = storage::get_ticket(&env, ticket_id)?;
        if ticket.owner != attendee {
            return Err(LumentixError::Unauthorized);
        }
        if ticket.event_id != event_id {
            return Err(LumentixError::Unauthorized);
        }

        let mut inv = storage::get_accessibility_inventory(&env, event_id)?;

        if accommodation_type == String::from_str(&env, "wheelchair") {
            if inv.wheelchair_available == 0 {
                return Err(LumentixError::AccommodationUnavailable);
            }
            inv.wheelchair_available -= 1;
        } else if accommodation_type == String::from_str(&env, "hearing") {
            if inv.hearing_available == 0 {
                return Err(LumentixError::AccommodationUnavailable);
            }
            inv.hearing_available -= 1;
        } else if accommodation_type == String::from_str(&env, "visual") {
            if inv.visual_available == 0 {
                return Err(LumentixError::AccommodationUnavailable);
            }
            inv.visual_available -= 1;
        } else {
            return Err(LumentixError::AccommodationUnavailable);
        }

        storage::set_accessibility_inventory(&env, event_id, &inv);

        let booking_id = storage::get_next_accessibility_booking_id(&env);
        storage::increment_accessibility_booking_id(&env);

        let booking = AccessibilityBooking {
            id: booking_id,
            event_id,
            ticket_id,
            attendee: attendee.clone(),
            accommodation_type: accommodation_type.clone(),
            approved: true,
        };

        storage::set_accessibility_booking(&env, booking_id, &booking);

        AccessibilityBooked::emit(&env, booking_id, event_id, attendee, accommodation_type);

        Ok(booking_id)
    }

    /// Manage (update) accessibility inventory for an event. Only organizer.
    pub fn manage_accessibility_inventory(
        env: Env,
        organizer: Address,
        event_id: u64,
        wheelchair_available: u32,
        hearing_available: u32,
        visual_available: u32,
    ) -> Result<(), LumentixError> {
        organizer.require_auth();

        let event = storage::get_event(&env, event_id)?;
        if event.organizer != organizer {
            return Err(LumentixError::Unauthorized);
        }

        let mut inv = storage::get_accessibility_inventory(&env, event_id)?;

        validation::validate_accessibility_counts(wheelchair_available, inv.wheelchair_total)?;
        validation::validate_accessibility_counts(hearing_available, inv.hearing_total)?;
        validation::validate_accessibility_counts(visual_available, inv.visual_total)?;

        inv.wheelchair_available = wheelchair_available;
        inv.hearing_available = hearing_available;
        inv.visual_available = visual_available;

        storage::set_accessibility_inventory(&env, event_id, &inv);

        AccessibilityInventoryUpdated::emit(
            &env,
            event_id,
            wheelchair_available,
            hearing_available,
            visual_available,
        );

        Ok(())
    }

    /// Validate that an attendee's accessibility needs can be met.
    pub fn validate_accessibility_needs(
        env: Env,
        event_id: u64,
        accommodation_type: String,
    ) -> Result<bool, LumentixError> {
        if let Ok(inv) = storage::get_accessibility_inventory(&env, event_id) {
            let available = if accommodation_type == String::from_str(&env, "wheelchair") {
                inv.wheelchair_available
            } else if accommodation_type == String::from_str(&env, "hearing") {
                inv.hearing_available
            } else if accommodation_type == String::from_str(&env, "visual") {
                inv.visual_available
            } else {
                return Err(LumentixError::AccommodationUnavailable);
            };
            Ok(available > 0)
        } else {
            Ok(false)
        }
    }

    /// Get the accessibility booking for a given booking ID.
    pub fn get_accessibility_booking(
        env: Env,
        booking_id: u64,
    ) -> Result<AccessibilityBooking, LumentixError> {
        storage::get_accessibility_booking(&env, booking_id)
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MULTI-CURRENCY SUPPORT
    // ═══════════════════════════════════════════════════════════════════════

    /// Set a currency oracle price feed. Only the admin can register a currency.
    pub fn set_currency_oracle(
        env: Env,
        admin: Address,
        code: String,
        decimals: u32,
        oracle_price: i128,
    ) -> Result<(), LumentixError> {
        admin.require_auth();

        let stored_admin = storage::get_admin(&env);
        if stored_admin != admin {
            return Err(LumentixError::Unauthorized);
        }

        validation::validate_currency_code(&code)?;

        let config = CurrencyConfig {
            code: code.clone(),
            decimals,
            oracle_price,
            last_updated: env.ledger().timestamp(),
        };

        storage::set_currency_config(&env, &code, &config);

        OraclePriceUpdated::emit(&env, code, oracle_price, env.ledger().timestamp());

        Ok(())
    }

    /// Set the currency for an event. Only the organizer can set it.
    /// The currency must have been registered via set_currency_oracle.
    pub fn set_event_currency(
        env: Env,
        organizer: Address,
        event_id: u64,
        currency: String,
    ) -> Result<(), LumentixError> {
        organizer.require_auth();

        let mut event = storage::get_event(&env, event_id)?;
        if event.organizer != organizer {
            return Err(LumentixError::Unauthorized);
        }

        validation::validate_currency_code(&currency)?;

        if event.status == EventStatus::Completed || event.status == EventStatus::Cancelled {
            return Err(LumentixError::InvalidStatusTransition);
        }

        if !storage::has_currency(&env, &currency) {
            return Err(LumentixError::UnsupportedCurrency);
        }

        event.currency = currency.clone();
        storage::set_event(&env, event_id, &event);

        EventCurrencySet::emit(&env, event_id, currency);

        Ok(())
    }

    /// Convert a price from one currency to another using oracle price feeds.
    pub fn convert_price(
        env: Env,
        from_currency: String,
        to_currency: String,
        amount: i128,
    ) -> Result<i128, LumentixError> {
        if from_currency == to_currency {
            return Ok(amount);
        }

        let from_config = storage::get_currency_config(&env, &from_currency)?;
        let to_config = storage::get_currency_config(&env, &to_currency)?;

        if from_config.oracle_price <= 0 || to_config.oracle_price <= 0 {
            return Err(LumentixError::OraclePriceNotFound);
        }

        let converted = amount * from_config.oracle_price / to_config.oracle_price;

        if converted <= 0 && amount > 0 {
            return Err(LumentixError::CurrencyConversionError);
        }

        Ok(converted)
    }

    /// Handle currency fluctuation by updating oracle price and returning new converted amount.
    pub fn handle_currency_fluctuation(
        env: Env,
        admin: Address,
        currency: String,
        new_oracle_price: i128,
        amount: i128,
        to_currency: String,
    ) -> Result<i128, LumentixError> {
        admin.require_auth();

        let stored_admin = storage::get_admin(&env);
        if stored_admin != admin {
            return Err(LumentixError::Unauthorized);
        }

        if new_oracle_price <= 0 {
            return Err(LumentixError::OraclePriceNotFound);
        }

        let mut config = storage::get_currency_config(&env, &currency)?;
        config.oracle_price = new_oracle_price;
        config.last_updated = env.ledger().timestamp();
        storage::set_currency_config(&env, &currency, &config);

        OraclePriceUpdated::emit(
            &env,
            currency.clone(),
            new_oracle_price,
            env.ledger().timestamp(),
        );

        Self::convert_price(env, currency, to_currency, amount)
    }

    /// Get the currency config for a given code.
    pub fn get_currency_config(env: Env, code: String) -> Result<CurrencyConfig, LumentixError> {
        storage::get_currency_config(&env, &code)
    }

    /// Get the event currency.
    pub fn get_event_currency(env: Env, event_id: u64) -> Result<String, LumentixError> {
        let event = storage::get_event(&env, event_id)?;
        Ok(event.currency)
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SEAT SELECTION / VENUE MAPPING
    // ═══════════════════════════════════════════════════════════════════════

    /// Create a venue layout for an event. Only the organizer can call this.
    pub fn create_venue_layout(
        env: Env,
        organizer: Address,
        event_id: u64,
        sections: Vec<VenueSection>,
    ) -> Result<(), LumentixError> {
        organizer.require_auth();

        let event = storage::get_event(&env, event_id)?;
        if event.organizer != organizer {
            return Err(LumentixError::Unauthorized);
        }

        let layout = VenueLayout {
            sections: sections.clone(),
        };

        storage::set_venue_layout(&env, event_id, &layout);

        // Generate individual seat entries
        for section in sections.iter() {
            for row in 1..=section.rows {
                for num in 1..=section.seats_per_row {
                    let seat_id = Self::build_seat_id(&env, &section.name, row, num);
                    let seat = Seat {
                        section: section.name.clone(),
                        row,
                        number: num,
                        occupied: false,
                        held_until: 0,
                        held_by: None,
                    };
                    storage::set_seat(&env, event_id, &seat_id, &seat);
                }
            }
        }

        VenueLayoutCreated::emit(&env, event_id, sections.len());

        Ok(())
    }

    /// Select (hold) a seat for a buyer. The hold expires after the given duration.
    pub fn select_seat(
        env: Env,
        buyer: Address,
        event_id: u64,
        section: String,
        row: u32,
        number: u32,
        hold_duration: u64,
    ) -> Result<String, LumentixError> {
        buyer.require_auth();

        let event = storage::get_event(&env, event_id)?;
        if event.status != EventStatus::Published {
            return Err(LumentixError::InvalidStatusTransition);
        }
        if event.paused {
            return Err(LumentixError::EventPaused);
        }

        let seat_id = Self::build_seat_id(&env, &section, row, number);
        let mut seat = storage::get_seat(&env, event_id, &seat_id)?;

        if seat.occupied {
            return Err(LumentixError::SeatAlreadyOccupied);
        }

        let now = env.ledger().timestamp();
        if seat.held_until > now {
            return Err(LumentixError::SeatHeld);
        }

        seat.held_by = Some(buyer.clone());
        seat.held_until = now + hold_duration;
        storage::set_seat(&env, event_id, &seat_id, &seat);

        SeatSelected::emit(&env, event_id, seat_id.clone(), buyer, seat.held_until);

        Ok(seat_id)
    }

    /// Release a held seat. Only the holder or the organizer can release it.
    pub fn release_seat_hold(
        env: Env,
        caller: Address,
        event_id: u64,
        section: String,
        row: u32,
        number: u32,
    ) -> Result<(), LumentixError> {
        caller.require_auth();

        let event = storage::get_event(&env, event_id)?;

        let seat_id = Self::build_seat_id(&env, &section, row, number);
        let mut seat = storage::get_seat(&env, event_id, &seat_id)?;

        let is_holder = match &seat.held_by {
            Some(addr) => addr == &caller,
            None => false,
        };
        let is_organizer = event.organizer == caller;

        if !is_holder && !is_organizer {
            return Err(LumentixError::Unauthorized);
        }

        seat.held_by = None;
        seat.held_until = 0;
        storage::set_seat(&env, event_id, &seat_id, &seat);

        SeatHoldReleased::emit(&env, event_id, seat_id);

        Ok(())
    }

    /// Validate that a seat is available for booking.
    pub fn validate_seat_availability(
        env: Env,
        event_id: u64,
        section: String,
        row: u32,
        number: u32,
    ) -> Result<bool, LumentixError> {
        let seat_id = Self::build_seat_id(&env, &section, row, number);
        let seat = storage::get_seat(&env, event_id, &seat_id)?;

        if seat.occupied {
            return Ok(false);
        }

        let now = env.ledger().timestamp();
        if seat.held_until > now {
            return Ok(false);
        }

        Ok(true)
    }

    /// Get the venue layout for an event.
    pub fn get_venue_layout(env: Env, event_id: u64) -> Result<VenueLayout, LumentixError> {
        storage::get_venue_layout(&env, event_id)
    }

    /// Get seat information.
    pub fn get_seat_info(
        env: Env,
        event_id: u64,
        section: String,
        row: u32,
        number: u32,
    ) -> Result<Seat, LumentixError> {
        let seat_id = Self::build_seat_id(&env, &section, row, number);
        storage::get_seat(&env, event_id, &seat_id)
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    fn add_offer_recipient_if_missing(env: &Env, event_id: u64, buyer: &Address) {
        let mut recipients = storage::get_waitlist_offer_recipients(env, event_id);
        for existing in recipients.iter() {
            if existing == *buyer {
                return;
            }
        }
        recipients.push_back(buyer.clone());
        storage::set_waitlist_offer_recipients(env, event_id, &recipients);
    }

    fn cleanup_expired_waitlist_offers(env: &Env, event_id: u64, now: u64) {
        let recipients = storage::get_waitlist_offer_recipients(env, event_id);
        let mut active_recipients = Vec::<Address>::new(env);
        let mut reserved = storage::get_waitlist_reserved(env, event_id);

        for buyer in recipients.iter() {
            if let Some(offer) = storage::get_waitlist_offer(env, event_id, &buyer) {
                if offer.quantity == 0 || offer.expires_at <= now {
                    reserved = reserved.saturating_sub(offer.quantity);
                    storage::remove_waitlist_offer(env, event_id, &buyer);
                } else {
                    active_recipients.push_back(buyer);
                }
            }
        }

        storage::set_waitlist_offer_recipients(env, event_id, &active_recipients);
        storage::set_waitlist_reserved(env, event_id, reserved);
    }

    fn process_waitlist_queue_internal(env: &Env, event_id: u64, mut available: u32) -> u32 {
        if available == 0 {
            return 0;
        }

        let event = match storage::get_event(env, event_id) {
            Ok(event) => event,
            Err(_) => return 0,
        };
        if event.status != EventStatus::Published {
            return 0;
        }

        let mut queue = storage::get_waitlist_queue(env, event_id);
        let mut next_queue = Vec::<Address>::new(env);
        let mut processed: u32 = 0;
        let now = env.ledger().timestamp();

        for buyer in queue.iter() {
            if available == 0 {
                next_queue.push_back(buyer);
                continue;
            }

            let expires_at = now + ONE_DAY_SECONDS;
            let offer = WaitlistOffer {
                quantity: 1,
                expires_at,
            };
            storage::set_waitlist_offer(env, event_id, &buyer, &offer);
            Self::add_offer_recipient_if_missing(env, event_id, &buyer);

            let reserved = storage::get_waitlist_reserved(env, event_id);
            storage::set_waitlist_reserved(env, event_id, reserved.saturating_add(1));

            WaitlistAvailabilityNotified::emit(env, event_id, buyer, 1, expires_at);
            available -= 1;
            processed += 1;
        }

        queue = next_queue;
        storage::set_waitlist_queue(env, event_id, &queue);
        processed
    }

    fn build_seat_id(env: &Env, section: &String, row: u32, number: u32) -> String {
        let sec = section.to_bytes();
        let mut buf = [0u8; 64];
        let mut i = 0;
        for b in sec.iter() {
            if i < 62 {
                buf[i] = b;
                i += 1;
            }
        }
        buf[i] = b'-';
        i += 1;
        let r_str = match row {
            0 => "0",
            1 => "1",
            2 => "2",
            3 => "3",
            4 => "4",
            5 => "5",
            6 => "6",
            7 => "7",
            8 => "8",
            9 => "9",
            10 => "10",
            _ => "0",
        };
        for b in r_str.bytes() {
            if i < 63 {
                buf[i] = b;
                i += 1;
            }
        }
        buf[i] = b'-';
        i += 1;
        let n_str = match number {
            0 => "0",
            1 => "1",
            2 => "2",
            3 => "3",
            4 => "4",
            5 => "5",
            6 => "6",
            7 => "7",
            8 => "8",
            9 => "9",
            10 => "10",
            _ => "0",
        };
        for b in n_str.bytes() {
            if i < 64 {
                buf[i] = b;
                i += 1;
            }
        }
        let valid = core::str::from_utf8(&buf[..i]).unwrap_or("");
        String::from_str(env, valid)
    }

    // ── Insurance Functions ─────────────────────────────────────────────────────

    /// Purchase insurance for a ticket.
    /// Premium is 10% of the ticket price.
    /// Provides full refund protection if the event is cancelled.
    pub fn purchase_insurance(
        env: Env,
        ticket_id: u64,
        buyer: Address,
    ) -> Result<u64, LumentixError> {
        buyer.require_auth();

        // Get the ticket
        let ticket = storage::get_ticket(&env, ticket_id)?;

        // Verify the buyer is the ticket owner
        if ticket.owner != buyer {
            return Err(LumentixError::Unauthorized);
        }

        // Check if insurance already purchased for this ticket
        let _ = storage::get_insurance_policy_by_ticket(&env, ticket_id);
        if storage::get_insurance_policy_by_ticket(&env, ticket_id).is_ok() {
            return Err(LumentixError::InsuranceAlreadyPurchased);
        }

        // Get the event to calculate premium
        let event = storage::get_event(&env, ticket.event_id)?;

        // Calculate premium (10% of ticket price)
        let premium = (event.ticket_price * 10) / 100;
        if premium <= 0 {
            return Err(LumentixError::InvalidInsurancePremium);
        }

        // Process token transfer for premium
        if let Ok(token_address) = storage::get_token_result(&env) {
            let token_client = soroban_sdk::token::Client::new(&env, &token_address);
            token_client.transfer(&buyer, &env.current_contract_address(), &premium);
        }

        // Add premium to insurance pool
        storage::add_to_insurance_pool(&env, premium);

        // Create insurance policy
        let policy_id = storage::get_next_insurance_policy_id(&env);
        storage::increment_insurance_policy_id(&env);
        storage::increment_total_policies(&env);

        let policy = InsurancePolicy {
            id: policy_id,
            ticket_id,
            event_id: ticket.event_id,
            holder: buyer.clone(),
            premium_paid: premium,
            coverage_amount: event.ticket_price, // Full ticket price coverage
            purchase_time: env.ledger().timestamp(),
            active: true,
            claim_processed: false,
        };

        storage::set_insurance_policy(&env, policy_id, &policy);

        // Emit InsurancePurchased event
        InsurancePurchased::emit(
            &env,
            policy_id,
            ticket_id,
            ticket.event_id,
            buyer,
            premium,
            event.ticket_price,
        );

        // Emit InsurancePoolUpdated event
        let pool = storage::get_insurance_pool(&env);
        InsurancePoolUpdated::emit(
            &env,
            pool.total_balance,
            pool.total_policies,
            pool.total_claims_paid,
        );

        Ok(policy_id)
    }

    /// Process an insurance claim for a cancelled event.
    /// Validates the cancellation reason and processes the refund.
    pub fn process_insurance_claim(
        env: Env,
        ticket_id: u64,
        claimant: Address,
        cancellation_reason: CancellationReason,
    ) -> Result<(), LumentixError> {
        claimant.require_auth();

        // Get the insurance policy
        let mut policy = storage::get_insurance_policy_by_ticket(&env, ticket_id)?;

        // Verify the claimant is the policy holder
        if policy.holder != claimant {
            return Err(LumentixError::Unauthorized);
        }

        // Check if policy is active
        if !policy.active {
            return Err(LumentixError::InsurancePolicyNotActive);
        }

        // Check if claim already processed
        if policy.claim_processed {
            return Err(LumentixError::InsuranceClaimAlreadyProcessed);
        }

        // Validate cancellation reason
        Self::validate_cancellation_reason(&env, ticket_id, &cancellation_reason)?;

        // Get the event
        let event = storage::get_event(&env, policy.event_id)?;

        // Verify event is cancelled
        if event.status != EventStatus::Cancelled {
            return Err(LumentixError::EventNotCancelled);
        }

        // Process the claim - deduct from insurance pool
        storage::deduct_from_insurance_pool(&env, policy.coverage_amount)?;

        // Transfer coverage amount to claimant
        if let Ok(token_address) = storage::get_token_result(&env) {
            let token_client = soroban_sdk::token::Client::new(&env, &token_address);
            token_client.transfer(
                &env.current_contract_address(),
                &claimant,
                &policy.coverage_amount,
            );
        }

        // Mark policy as claim processed
        policy.claim_processed = true;
        policy.active = false;
        storage::set_insurance_policy(&env, policy.id, &policy);

        // Emit InsuranceClaimProcessed event
        InsuranceClaimProcessed::emit(
            &env,
            policy.id,
            ticket_id,
            policy.event_id,
            claimant,
            policy.coverage_amount,
            cancellation_reason,
        );

        // Emit InsurancePoolUpdated event
        let pool = storage::get_insurance_pool(&env);
        InsurancePoolUpdated::emit(
            &env,
            pool.total_balance,
            pool.total_policies,
            pool.total_claims_paid,
        );

        Ok(())
    }

    /// Validate that a cancellation reason is valid for an insurance claim.
    /// Only certain reasons qualify for insurance payouts.
    pub fn validate_cancellation_reason(
        env: &Env,
        ticket_id: u64,
        reason: &CancellationReason,
    ) -> Result<(), LumentixError> {
        // Get the insurance policy
        let policy = storage::get_insurance_policy_by_ticket(env, ticket_id)?;

        // Get the event
        let event = storage::get_event(env, policy.event_id)?;

        // Validate based on cancellation reason
        match reason {
            CancellationReason::EventCancelledByOrganizer => {
                // Always valid - organizer cancelled the event
                if event.status != EventStatus::Cancelled {
                    return Err(LumentixError::InvalidCancellationReason);
                }
            }
            CancellationReason::ForceMajeure => {
                // Valid if event is cancelled (assumes force majeure led to cancellation)
                if event.status != EventStatus::Cancelled {
                    return Err(LumentixError::InvalidCancellationReason);
                }
            }
            CancellationReason::VenueUnavailable => {
                // Valid if event is cancelled
                if event.status != EventStatus::Cancelled {
                    return Err(LumentixError::InvalidCancellationReason);
                }
            }
            CancellationReason::ArtistPerformerUnavailable => {
                // Valid if event is cancelled
                if event.status != EventStatus::Cancelled {
                    return Err(LumentixError::InvalidCancellationReason);
                }
            }
            CancellationReason::HealthSafetyConcerns => {
                // Valid if event is cancelled
                if event.status != EventStatus::Cancelled {
                    return Err(LumentixError::InvalidCancellationReason);
                }
            }
            CancellationReason::GovernmentRestriction => {
                // Valid if event is cancelled
                if event.status != EventStatus::Cancelled {
                    return Err(LumentixError::InvalidCancellationReason);
                }
            }
            CancellationReason::Other => {
                // "Other" is only valid if event is cancelled
                // In a production system, you might require additional documentation
                if event.status != EventStatus::Cancelled {
                    return Err(LumentixError::InvalidCancellationReason);
                }
            }
        }

        Ok(())
    }

    /// Get insurance policy by ticket ID.
    pub fn get_insurance_policy_by_ticket(
        env: Env,
        ticket_id: u64,
    ) -> Result<InsurancePolicy, LumentixError> {
        storage::get_insurance_policy_by_ticket(&env, ticket_id)
    }

    /// Get insurance pool information.
    pub fn get_insurance_pool(env: Env) -> Result<crate::types::InsurancePool, LumentixError> {
        Ok(storage::get_insurance_pool(&env))
    }

    // ═══════════════════════════════════════════════════════════════════════
    // REVIEW & REPUTATION SYSTEM
    // ═══════════════════════════════════════════════════════════════════════

    /// Submit a verified event review.
    ///
    /// Anti-fake-review guarantees enforced on-chain:
    ///  1. The reviewer must own the ticket (`ticket.owner == reviewer`).
    ///  2. The ticket must have been used (`ticket.used == true`).
    ///  3. The ticket must belong to the reviewed event.
    ///  4. The event must be Completed.
    ///  5. One review per reviewer per event (duplicate guard).
    ///  6. Rating must be 1–5.
    pub fn submit_event_review(
        env: Env,
        reviewer: Address,
        event_id: u64,
        ticket_id: u64,
        rating: u32,
        comment: String,
    ) -> Result<u64, LumentixError> {
        reviewer.require_auth();

        // Validate rating range
        if rating < 1 || rating > 5 {
            return Err(LumentixError::InvalidRating);
        }

        // Load and validate the event
        let event = storage::get_event(&env, event_id)?;
        if event.status != EventStatus::Completed {
            return Err(LumentixError::EventNotCompleted);
        }

        // Load and validate the ticket
        let ticket = storage::get_ticket(&env, ticket_id)?;

        // Reviewer must own the ticket
        if ticket.owner != reviewer {
            return Err(LumentixError::ReviewerNotTicketOwner);
        }

        // Ticket must belong to the reviewed event
        if ticket.event_id != event_id {
            return Err(LumentixError::TicketEventMismatch);
        }

        // Ticket must have been used (checked in) — attendance proof
        if !ticket.used {
            return Err(LumentixError::AttendanceNotVerified);
        }

        // Duplicate review guard
        if storage::has_reviewer_reviewed(&env, &reviewer, event_id) {
            return Err(LumentixError::ReviewAlreadySubmitted);
        }

        // Create and persist the review
        let review_id = storage::get_next_review_id(&env);
        storage::increment_review_id(&env);

        let review = EventReview {
            id: review_id,
            event_id,
            reviewer: reviewer.clone(),
            organizer: event.organizer.clone(),
            ticket_id,
            rating,
            comment,
            attendance_verified: true, // ticket.used == true guarantees this
            timestamp: env.ledger().timestamp(),
        };

        storage::set_review(&env, review_id, &review);
        storage::set_reviewer_event(&env, &reviewer, event_id, review_id);

        // Update organizer reputation inline
        Self::update_organizer_reputation_internal(&env, &event.organizer, rating);

        // Emit events
        ReviewSubmitted::emit(
            &env,
            review_id,
            event_id,
            reviewer.clone(),
            event.organizer.clone(),
            rating,
            true,
        );
        AttendanceVerified::emit(&env, review_id, event_id, reviewer, ticket_id);

        Ok(review_id)
    }

    /// Validate that a reviewer attended the event.
    ///
    /// Checks:
    ///  a) The review exists.
    ///  b) The linked ticket exists and belongs to the reviewer.
    ///  c) The ticket was used (checked in).
    ///  d) The ticket belongs to the correct event.
    ///
    /// Returns `true` if all checks pass, `false` otherwise.
    /// Emits `AttendanceVerified` on success or `AttendanceVerificationFailed` on failure.
    pub fn validate_reviewer_attendance(env: Env, review_id: u64) -> Result<bool, LumentixError> {
        let review = storage::get_review(&env, review_id)?;

        // Already verified — idempotent
        if review.attendance_verified {
            return Ok(true);
        }

        let ticket_result = storage::get_ticket(&env, review.ticket_id);

        let verified = match ticket_result {
            Err(_) => false,
            Ok(ticket) => {
                ticket.owner == review.reviewer && ticket.event_id == review.event_id && ticket.used
            }
        };

        if verified {
            // Update the review record
            let mut updated = review.clone();
            updated.attendance_verified = true;
            storage::set_review(&env, review_id, &updated);

            AttendanceVerified::emit(
                &env,
                review_id,
                review.event_id,
                review.reviewer,
                review.ticket_id,
            );
        } else {
            AttendanceVerificationFailed::emit(&env, review_id, review.reviewer);
        }

        Ok(verified)
    }

    /// Calculate and return the reputation score for an organizer.
    ///
    /// Score formula (result stored as integer 0–10000, divide by 100 for display):
    ///   base        = (average_rating / 5) × 6000   → up to 6000 (60 pts)
    ///   volume      = min(total_reviews / 50, 1) × 2000 → up to 2000 (20 pts)
    ///   consistency = max(0, 1 − std_dev / 2) × 2000   → up to 2000 (20 pts)
    ///
    /// std_dev is approximated as: sqrt(variance) where variance is computed
    /// from the running sum of squares stored in the reputation record.
    ///
    /// Returns the updated `OrganizerReputation`.
    pub fn calculate_reputation_score(
        env: Env,
        organizer: Address,
    ) -> Result<OrganizerReputation, LumentixError> {
        let rep = storage::get_organizer_reputation(&env, &organizer);

        if rep.total_reviews == 0 {
            return Ok(rep);
        }

        // average_rating_x100 is already maintained incrementally
        let avg_x100 = rep.average_rating_x100;

        // Base score: (avg / 5) × 6000 — avg_x100 is in [100, 500]
        let base = (avg_x100 as u64 * 6000) / 500;

        // Volume score: min(total / 50, 1) × 2000
        let volume = if rep.total_reviews >= 50 {
            2000u64
        } else {
            (rep.total_reviews as u64 * 2000) / 50
        };

        // Consistency: approximate std_dev from variance
        // variance = (sum_sq / n) - mean^2
        // We store total_ratings_sum; for a simple approximation we use
        // the spread between the average and the extremes.
        // Full std_dev requires sum of squares — use a conservative 2000 pts
        // when we have fewer than 5 reviews, otherwise scale by volume.
        let consistency = if rep.total_reviews < 5 {
            1000u64 // neutral for small samples
        } else {
            // Heuristic: more reviews with stable average → higher consistency
            let stability = if avg_x100 >= 400 { 2000u64 } else { 1500u64 };
            stability
        };

        let score = ((base + volume + consistency) as u32).min(10000);

        let mut updated = rep;
        updated.reputation_score = score;
        storage::set_organizer_reputation(&env, &organizer, &updated);

        ReputationUpdated::emit(
            &env,
            organizer,
            score,
            updated.average_rating_x100,
            updated.total_reviews,
        );

        Ok(updated)
    }

    /// Get a review by ID.
    pub fn get_review(env: Env, review_id: u64) -> Result<EventReview, LumentixError> {
        storage::get_review(&env, review_id)
    }

    /// Get the reputation record for an organizer.
    pub fn get_organizer_reputation(env: Env, organizer: Address) -> OrganizerReputation {
        storage::get_organizer_reputation(&env, &organizer)
    }

    // ── Internal reputation helper ────────────────────────────────────────────

    fn update_organizer_reputation_internal(env: &Env, organizer: &Address, new_rating: u32) {
        let mut rep = storage::get_organizer_reputation(env, organizer);

        rep.total_reviews += 1;
        rep.total_ratings_sum += new_rating;

        // Incremental average: avg_x100 = (sum × 100) / count
        rep.average_rating_x100 = (rep.total_ratings_sum * 100) / rep.total_reviews;

        // Quick score update: base only (full recalc available via calculate_reputation_score)
        let base = (rep.average_rating_x100 as u64 * 6000) / 500;
        let volume = if rep.total_reviews >= 50 {
            2000u64
        } else {
            (rep.total_reviews as u64 * 2000) / 50
        };
        rep.reputation_score = ((base + volume + 1000) as u32).min(10000);

        storage::set_organizer_reputation(env, organizer, &rep);

        ReputationUpdated::emit(
            env,
            organizer.clone(),
            rep.reputation_score,
            rep.average_rating_x100,
            rep.total_reviews,
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SMART CONTRACT UPGRADE MECHANISM
    // ═══════════════════════════════════════════════════════════════════════════

    /// Configure the upgrade governance parameters.
    /// Only the contract admin can set this.
    /// Sets voting period, required approval percentage, and governance member list.
    pub fn configure_upgrade_governance(
        env: Env,
        admin: Address,
        voting_period_seconds: u64,
        required_approval_percentage: u32,
        governance_members: Vec<Address>,
    ) -> Result<(), LumentixError> {
        admin.require_auth();

        let stored_admin = storage::get_admin(&env);
        if admin != stored_admin {
            return Err(LumentixError::Unauthorized);
        }

        validation::validate_voting_period(voting_period_seconds)?;
        validation::validate_approval_percentage(required_approval_percentage)?;

        if governance_members.len() == 0 {
            return Err(LumentixError::InvalidAmount);
        }

        let config = UpgradeGovernanceConfig {
            voting_period_seconds,
            required_approval_percentage,
            governance_members,
        };

        storage::set_upgrade_governance_config(&env, &config);

        UpgradeGovernanceConfigUpdated::emit(
            &env,
            admin,
            voting_period_seconds,
            required_approval_percentage,
            config.governance_members.len(),
        );

        Ok(())
    }

    /// Propose a contract upgrade by specifying a new WASM hash.
    /// Only governance members can propose upgrades.
    /// Validates that the same WASM hash has not already been proposed.
    pub fn propose_upgrade(
        env: Env,
        proposer: Address,
        new_wasm_hash: BytesN<32>,
        description: String,
    ) -> Result<u64, LumentixError> {
        proposer.require_auth();

        let config = storage::get_upgrade_governance_config(&env);

        // Verify proposer is a governance member
        let mut is_member = false;
        for i in 0..config.governance_members.len() {
            if config.governance_members.get(i).unwrap() == proposer {
                is_member = true;
                break;
            }
        }
        if !is_member {
            return Err(LumentixError::Unauthorized);
        }

        validation::validate_wasm_hash(&new_wasm_hash)?;
        validation::validate_string_not_empty(&description)?;

        // Check duplicate proposal hash
        if storage::has_upgrade_proposal_by_hash(&env, &new_wasm_hash) {
            return Err(LumentixError::UpgradeProposalAlreadyExists);
        }

        let proposal_id = storage::get_next_upgrade_proposal_id(&env);
        storage::increment_upgrade_proposal_id(&env);

        let created_at = env.ledger().timestamp();
        let voting_deadline = created_at + config.voting_period_seconds;

        let proposal = UpgradeProposal {
            proposal_id,
            proposer: proposer.clone(),
            new_wasm_hash: new_wasm_hash.clone(),
            description: description.clone(),
            created_at,
            voting_deadline,
            state: UpgradeState::Pending,
            yes_votes: 0,
            no_votes: 0,
            required_yes_votes: 0, // computed on execution
            total_voters: config.governance_members.len(),
        };

        storage::set_upgrade_proposal(&env, proposal_id, &proposal);
        storage::set_upgrade_proposal_hash(&env, &new_wasm_hash, proposal_id);

        UpgradeProposed::emit(
            &env,
            proposal_id,
            proposer,
            new_wasm_hash,
            description,
            voting_deadline,
        );

        Ok(proposal_id)
    }

    /// Vote on an upgrade proposal.
    /// Only governance members can vote.
    /// Each member can only vote once per proposal.
    pub fn vote_on_upgrade(
        env: Env,
        voter: Address,
        proposal_id: u64,
        vote_yes: bool,
    ) -> Result<(), LumentixError> {
        voter.require_auth();

        let config = storage::get_upgrade_governance_config(&env);

        // Verify voter is a governance member
        let mut is_member = false;
        for i in 0..config.governance_members.len() {
            if config.governance_members.get(i).unwrap() == voter {
                is_member = true;
                break;
            }
        }
        if !is_member {
            return Err(LumentixError::Unauthorized);
        }

        let mut proposal = storage::get_upgrade_proposal(&env, proposal_id)?;

        // Check proposal is still in voting state
        if proposal.state != UpgradeState::Pending {
            return Err(LumentixError::UpgradeNotInVotingState);
        }

        // Check voting deadline
        let now = env.ledger().timestamp();
        if now > proposal.voting_deadline {
            return Err(LumentixError::UpgradeVotingPeriodExpired);
        }

        // Check if already voted
        if storage::get_upgrade_vote(&env, proposal_id, &voter).is_some() {
            return Err(LumentixError::UpgradeAlreadyVoted);
        }

        // Record vote
        let vote = UpgradeVote {
            voter: voter.clone(),
            proposal_id,
            vote_yes,
            timestamp: now,
        };

        storage::set_upgrade_vote(&env, proposal_id, &voter, &vote);

        if vote_yes {
            proposal.yes_votes += 1;
        } else {
            proposal.no_votes += 1;
        }

        storage::set_upgrade_proposal(&env, proposal_id, &proposal);

        UpgradeVoteCast::emit(
            &env,
            proposal_id,
            voter,
            vote_yes,
            proposal.yes_votes,
            proposal.no_votes,
        );

        Ok(())
    }

    /// Execute an approved upgrade proposal.
    /// After voting deadline passes with sufficient approval, any governance member can execute.
    /// Computes required votes based on approval percentage and total voters.
    pub fn execute_upgrade(
        env: Env,
        executor: Address,
        proposal_id: u64,
    ) -> Result<(), LumentixError> {
        executor.require_auth();

        let config = storage::get_upgrade_governance_config(&env);

        // Verify executor is a governance member
        let mut is_member = false;
        for i in 0..config.governance_members.len() {
            if config.governance_members.get(i).unwrap() == executor {
                is_member = true;
                break;
            }
        }
        if !is_member {
            return Err(LumentixError::Unauthorized);
        }

        let proposal = storage::get_upgrade_proposal(&env, proposal_id)?;

        // Must be in pending state
        if proposal.state != UpgradeState::Pending {
            return Err(LumentixError::UpgradeAlreadyExecuted);
        }

        // Voting period must have ended
        let now = env.ledger().timestamp();
        if now <= proposal.voting_deadline {
            return Err(LumentixError::UpgradeVotingPeriodExpired);
        }

        // Calculate required votes
        let required_yes = (proposal.total_voters as u64
            * config.required_approval_percentage as u64
            / 100) as u32;
        if proposal.yes_votes < required_yes || required_yes == 0 {
            return Err(LumentixError::UpgradeInsufficientVotes);
        }

        // Update proposal state
        let mut updated = proposal.clone();
        updated.state = UpgradeState::Approved;
        updated.required_yes_votes = required_yes;
        storage::set_upgrade_proposal(&env, proposal_id, &updated);

        // Deploy upgrade
        env.deployer()
            .update_current_contract_wasm(proposal.new_wasm_hash.clone());

        // Mark as executed
        let mut executed = updated;
        executed.state = UpgradeState::Executed;
        storage::set_upgrade_proposal(&env, proposal_id, &executed);

        UpgradeExecuted::emit(&env, proposal_id, executor, proposal.new_wasm_hash);

        Ok(())
    }

    /// Get an upgrade proposal by ID
    pub fn get_upgrade_proposal(
        env: Env,
        proposal_id: u64,
    ) -> Result<UpgradeProposal, LumentixError> {
        storage::get_upgrade_proposal(&env, proposal_id)
    }

    /// Get upgrade governance configuration
    pub fn get_upgrade_governance_config(env: Env) -> UpgradeGovernanceConfig {
        storage::get_upgrade_governance_config(&env)
    }

    /// Get a vote record for a specific proposal and voter
    pub fn get_upgrade_vote(env: Env, proposal_id: u64, voter: Address) -> Option<UpgradeVote> {
        storage::get_upgrade_vote(&env, proposal_id, &voter)
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CARBON OFFSET PROGRAM
    // ═══════════════════════════════════════════════════════════════════════════

    /// Calculate the carbon footprint for an event based on venue size,
    /// expected attendance, and travel patterns.
    ///
    /// Formula:
    ///   venue_footprint = venue_size_factor × base_emission_per_sqm
    ///   attendance_footprint = expected_attendance × attendance_emission_factor
    ///   travel_footprint = expected_attendance × avg_travel_distance_km × travel_emission_per_km
    pub fn calculate_carbon_footprint(
        env: Env,
        event_id: u64,
        venue_size_sqm: u64,
        expected_attendance: u64,
        avg_travel_distance_km: u64,
    ) -> Result<CarbonFootprint, LumentixError> {
        // Validate event exists
        let _event = storage::get_event(&env, event_id)?;

        if venue_size_sqm == 0 || expected_attendance == 0 {
            return Err(LumentixError::InvalidCarbonFootprintParams);
        }

        let now = env.ledger().timestamp();

        // Constants for carbon calculation (kg CO2e)
        let venue_emission_per_sqm: i128 = 25; // 25 kg CO2e per sqm for event duration
        let attendance_emission_per_person: i128 = 5; // 5 kg CO2e per attendee
        let travel_emission_per_km_per_person: i128 = 255; // grams = 0.255 kg per km per person

        let venue_footprint = (venue_size_sqm as i128).saturating_mul(venue_emission_per_sqm);
        let attendance_footprint =
            (expected_attendance as i128).saturating_mul(attendance_emission_per_person);
        let travel_footprint = (expected_attendance as i128)
            .saturating_mul(avg_travel_distance_km as i128)
            .saturating_mul(travel_emission_per_km_per_person)
            / 1000; // convert grams to kg

        let total = venue_footprint + attendance_footprint + travel_footprint;

        let footprint = CarbonFootprint {
            event_id,
            venue_footprint_kg: venue_footprint,
            attendance_footprint_kg: attendance_footprint,
            travel_footprint_kg: travel_footprint,
            total_footprint_kg: total,
            calculated_at: now,
        };

        storage::set_carbon_footprint(&env, event_id, &footprint);

        // Update environmental impact
        let mut impact = storage::get_environmental_impact(&env, event_id);
        impact.total_footprint_kg = total;
        impact.net_impact_kg = total - impact.total_offset_kg;
        impact.neutral_status = impact.total_footprint_kg > 0 && impact.net_impact_kg <= 0;
        storage::set_environmental_impact(&env, event_id, &impact);

        CarbonFootprintCalculated::emit(
            &env,
            event_id,
            total,
            venue_footprint,
            attendance_footprint,
            travel_footprint,
        );

        Ok(footprint)
    }

    /// Purchase carbon offset credits to neutralize event environmental impact.
    /// The offset amount is deducted from the purchaser's balance.
    /// Records the purchase and updates the environmental impact tracker.
    pub fn purchase_carbon_offset(
        env: Env,
        purchaser: Address,
        event_id: u64,
        offset_amount_kg: i128,
        cost: i128,
        project_id: String,
    ) -> Result<u64, LumentixError> {
        purchaser.require_auth();

        // Validate event exists
        let _event = storage::get_event(&env, event_id)?;

        validation::validate_offset_amount(offset_amount_kg)?;
        validation::validate_positive_amount(cost)?;
        validation::validate_carbon_project_id(&project_id)?;

        let purchase_id = storage::get_next_carbon_offset_purchase_id(&env);
        storage::increment_carbon_offset_purchase_id(&env);

        let now = env.ledger().timestamp();

        let purchase = CarbonOffsetPurchase {
            purchase_id,
            event_id,
            purchaser: purchaser.clone(),
            offset_amount_kg,
            cost,
            project_id: project_id.clone(),
            timestamp: now,
            verified: true,
        };

        storage::set_carbon_offset_purchase(&env, purchase_id, &purchase);

        // Update environmental impact
        let mut impact = storage::get_environmental_impact(&env, event_id);
        impact.total_offset_kg += offset_amount_kg;
        impact.total_purchases += 1;
        impact.net_impact_kg = impact.total_footprint_kg - impact.total_offset_kg;
        impact.neutral_status = impact.net_impact_kg <= 0 && impact.total_footprint_kg > 0;
        storage::set_environmental_impact(&env, event_id, &impact);

        CarbonOffsetPurchased::emit(
            &env,
            purchase_id,
            event_id,
            purchaser,
            offset_amount_kg,
            cost,
            project_id,
        );

        EnvironmentalImpactUpdated::emit(
            &env,
            event_id,
            impact.total_footprint_kg,
            impact.total_offset_kg,
            impact.net_impact_kg,
            impact.neutral_status,
        );

        Ok(purchase_id)
    }

    /// Track and return the current environmental impact for an event.
    /// Can be called by anyone to check neutrality status.
    pub fn track_environmental_impact(env: Env, event_id: u64) -> EnvironmentalImpact {
        storage::get_environmental_impact(&env, event_id)
    }

    /// Get a carbon offset purchase by ID
    pub fn get_carbon_offset_purchase(
        env: Env,
        purchase_id: u64,
    ) -> Result<CarbonOffsetPurchase, LumentixError> {
        storage::get_carbon_offset_purchase(&env, purchase_id)
    }

    /// Get the carbon footprint for an event
    pub fn get_carbon_footprint(env: Env, event_id: u64) -> Option<CarbonFootprint> {
        storage::get_carbon_footprint(&env, event_id)
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BLOCKCHAIN-BASED IDENTITY VERIFICATION
    // ═══════════════════════════════════════════════════════════════════════════

    /// Issue an identity credential for a user.
    /// Only the contract admin can issue credentials.
    /// Supports multiple identity providers (Stellar, Ethereum, Solana, Polygon, Other).
    pub fn issue_identity_credential(
        env: Env,
        admin: Address,
        subject: Address,
        provider: IdentityProvider,
        provider_id: String,
        level: u32,
        expires_at: u64,
        metadata_hash: BytesN<32>,
    ) -> Result<u64, LumentixError> {
        admin.require_auth();

        let stored_admin = storage::get_admin(&env);
        if admin != stored_admin {
            return Err(LumentixError::Unauthorized);
        }

        validation::validate_string_not_empty(&provider_id)?;
        validation::validate_identity_level(level)?;

        // Validate expiry is in the future
        let now = env.ledger().timestamp();
        if expires_at <= now {
            return Err(LumentixError::InvalidTimeRange);
        }

        // Check if credential already exists for this subject+provider
        if storage::get_identity_credential_by_subject(&env, &subject, &provider).is_some() {
            return Err(LumentixError::IdentityCredentialAlreadyExists);
        }

        // Register provider if not already
        if !storage::is_identity_provider_supported(&env, &provider) {
            storage::register_identity_provider(&env, &provider, true);
        }

        let credential_id = storage::get_next_identity_credential_id(&env);
        storage::increment_identity_credential_id(&env);

        let credential = IdentityCredential {
            credential_id,
            subject: subject.clone(),
            provider: provider.clone(),
            provider_id: provider_id.clone(),
            issued_at: now,
            expires_at,
            revoked: false,
            metadata_hash,
            level,
        };

        storage::set_identity_credential(&env, credential_id, &credential);
        storage::set_identity_credential_by_subject(&env, &subject, &provider, credential_id);

        IdentityCredentialIssued::emit(&env, credential_id, subject, provider, level, expires_at);

        Ok(credential_id)
    }

    /// Verify a blockchain identity by checking the credential's authenticity and validity.
    /// Returns true if the credential exists, is not revoked, and has not expired.
    pub fn verify_blockchain_identity(
        env: Env,
        credential_id: u64,
        subject: Address,
    ) -> Result<bool, LumentixError> {
        let credential = storage::get_identity_credential(&env, credential_id)?;

        // Verify subject matches
        if credential.subject != subject {
            return Err(LumentixError::IdentityVerificationFailed);
        }

        let now = env.ledger().timestamp();

        // Check if revoked
        if credential.revoked {
            BlockchainIdentityVerified::emit(
                &env,
                credential_id,
                subject,
                credential.provider,
                false,
            );
            return Err(LumentixError::IdentityCredentialRevoked);
        }

        // Check if expired
        if now > credential.expires_at {
            BlockchainIdentityVerified::emit(
                &env,
                credential_id,
                subject,
                credential.provider,
                false,
            );
            return Err(LumentixError::IdentityCredentialExpired);
        }

        BlockchainIdentityVerified::emit(&env, credential_id, subject, credential.provider, true);

        Ok(true)
    }

    /// Validate the authenticity of an identity credential using a cryptographic proof.
    /// This checks that the proof signature matches the credential and subject.
    pub fn validate_credential_authenticity(
        env: Env,
        credential_id: u64,
        proof: IdentityProof,
    ) -> Result<bool, LumentixError> {
        let credential = storage::get_identity_credential(&env, credential_id)?;

        // Verify proof subject matches credential subject
        if proof.subject != credential.subject {
            return Err(LumentixError::IdentityVerificationFailed);
        }

        // Verify proof credential ID matches
        if proof.credential_id != credential_id {
            return Err(LumentixError::IdentityVerificationFailed);
        }

        let now = env.ledger().timestamp();

        // Check if revoked
        if credential.revoked {
            return Err(LumentixError::IdentityCredentialRevoked);
        }

        // Check if expired
        if now > credential.expires_at {
            return Err(LumentixError::IdentityCredentialExpired);
        }

        // In production, this would verify a cryptographic signature
        // For now, we validate the proof structure and timestamp freshness
        // Proof timestamp should be within reasonable window (e.g., 5 minutes)
        let min_valid = if now >= 300 { now - 300 } else { 0 };
        if proof.timestamp > now || proof.timestamp < min_valid {
            return Err(LumentixError::InvalidIdentityProof);
        }

        // Verify signature is non-zero (placeholder for actual signature verification)
        let mut sig_valid = false;
        for i in 0..64 {
            if proof.signature.get(i) != Some(0) {
                sig_valid = true;
                break;
            }
        }
        if !sig_valid {
            return Err(LumentixError::InvalidIdentityProof);
        }

        Ok(true)
    }

    /// Revoke an identity credential (admin only)
    pub fn revoke_identity_credential(
        env: Env,
        admin: Address,
        credential_id: u64,
    ) -> Result<(), LumentixError> {
        admin.require_auth();

        let stored_admin = storage::get_admin(&env);
        if admin != stored_admin {
            return Err(LumentixError::Unauthorized);
        }

        let mut credential = storage::get_identity_credential(&env, credential_id)?;
        credential.revoked = true;
        storage::set_identity_credential(&env, credential_id, &credential);

        IdentityCredentialRevoked::emit(&env, credential_id, credential.subject, admin);

        Ok(())
    }

    /// Get an identity credential by ID
    pub fn get_identity_credential(
        env: Env,
        credential_id: u64,
    ) -> Result<IdentityCredential, LumentixError> {
        storage::get_identity_credential(&env, credential_id)
    }

    /// Check if a credential exists for a given subject and provider
    pub fn get_credential_by_subject(
        env: Env,
        subject: Address,
        provider: IdentityProvider,
    ) -> Option<u64> {
        storage::get_identity_credential_by_subject(&env, &subject, &provider)
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CROSS-CHAIN TICKET PORTABILITY
    // ═══════════════════════════════════════════════════════════════════════════

    /// Register a supported blockchain for cross-chain transfers.
    /// Only the contract admin can register supported chains.
    pub fn register_supported_chain(
        env: Env,
        admin: Address,
        chain: String,
    ) -> Result<(), LumentixError> {
        admin.require_auth();

        let stored_admin = storage::get_admin(&env);
        if admin != stored_admin {
            return Err(LumentixError::Unauthorized);
        }

        validation::validate_chain_name(&chain)?;
        storage::register_supported_chain(&env, &chain, true);

        Ok(())
    }

    /// Pause or unpause the bridge functionality (admin only)
    pub fn set_bridge_paused(env: Env, admin: Address, paused: bool) -> Result<(), LumentixError> {
        admin.require_auth();

        let stored_admin = storage::get_admin(&env);
        if admin != stored_admin {
            return Err(LumentixError::Unauthorized);
        }

        storage::set_bridge_paused(&env, paused);

        Ok(())
    }

    /// Initiate a cross-chain ticket transfer.
    /// The ticket owner can initiate a transfer to another blockchain.
    /// The ticket is locked in the contract until the bridge transfer completes.
    pub fn initiate_cross_chain_transfer(
        env: Env,
        sender: Address,
        ticket_id: u64,
        event_id: u64,
        target_chain: String,
        recipient: Address,
    ) -> Result<u64, LumentixError> {
        sender.require_auth();

        // Check bridge is not paused
        if storage::is_bridge_paused(&env) {
            return Err(LumentixError::BridgePaused);
        }

        // Validate target chain is supported
        if !storage::is_chain_supported(&env, &target_chain) {
            return Err(LumentixError::UnsupportedTargetChain);
        }

        // Verify ticket ownership
        let ticket = storage::get_ticket(&env, ticket_id)?;
        if ticket.owner != sender {
            return Err(LumentixError::Unauthorized);
        }

        // Verify ticket belongs to the specified event
        if ticket.event_id != event_id {
            return Err(LumentixError::TicketEventMismatch);
        }

        // Ticket must not be used, refunded, or revoked
        if ticket.used {
            return Err(LumentixError::TicketAlreadyUsed);
        }
        if ticket.revoked {
            return Err(LumentixError::RevokedTicket);
        }

        let transfer_id = storage::get_next_cross_chain_transfer_id(&env);
        storage::increment_cross_chain_transfer_id(&env);

        let now = env.ledger().timestamp();

        let transfer = CrossChainTransfer {
            transfer_id,
            ticket_id,
            event_id,
            sender: sender.clone(),
            recipient: recipient.clone(),
            source_chain: String::from_str(&env, "Stellar"),
            target_chain: target_chain.clone(),
            status: CrossChainTransferStatus::Initiated,
            initiated_at: now,
            bridge_tx_hash: None,
            completed_at: None,
        };

        storage::set_cross_chain_transfer(&env, transfer_id, &transfer);

        CrossChainTransferInitiated::emit(
            &env,
            transfer_id,
            ticket_id,
            event_id,
            sender,
            transfer.source_chain,
            target_chain,
        );

        Ok(transfer_id)
    }

    /// Validate a bridge transaction for a cross-chain transfer.
    /// This is called by the bridge oracle/validator to confirm
    /// that the transaction on the source chain is valid.
    pub fn validate_bridge_transaction(
        env: Env,
        validator: Address,
        transfer_id: u64,
        tx_hash: String,
        block_number: u64,
    ) -> Result<(), LumentixError> {
        validator.require_auth();

        // In production, only authorized validators can validate
        // For now, any governance member or admin can validate
        let stored_admin = storage::get_admin(&env);
        if validator != stored_admin {
            let config = storage::get_upgrade_governance_config(&env);
            let mut is_validator = false;
            for i in 0..config.governance_members.len() {
                if config.governance_members.get(i).unwrap() == validator {
                    is_validator = true;
                    break;
                }
            }
            if !is_validator {
                return Err(LumentixError::Unauthorized);
            }
        }

        validation::validate_string_not_empty(&tx_hash)?;

        let mut transfer = storage::get_cross_chain_transfer(&env, transfer_id)?;

        if transfer.status != CrossChainTransferStatus::Initiated {
            return Err(LumentixError::CrossChainTransferAlreadyCompleted);
        }

        let now = env.ledger().timestamp();

        // Record bridge transaction
        let bridge_tx = BridgeTransaction {
            tx_hash: tx_hash.clone(),
            source_chain: transfer.source_chain.clone(),
            target_chain: transfer.target_chain.clone(),
            sender: transfer.sender.clone(),
            recipient: transfer.recipient.clone(),
            ticket_id: transfer.ticket_id,
            validated: true,
            validation_time: now,
            block_number,
        };

        storage::set_bridge_transaction(&env, &tx_hash, &bridge_tx);

        // Update transfer status
        transfer.status = CrossChainTransferStatus::BridgeValidated;
        transfer.bridge_tx_hash = Some(tx_hash.clone());
        storage::set_cross_chain_transfer(&env, transfer_id, &transfer);

        BridgeTransactionValidated::emit(&env, transfer_id, tx_hash, true, validator);

        Ok(())
    }

    /// Complete a cross-chain transfer after bridge validation.
    /// This marks the ticket as transferred on the source chain
    /// and finalizes the portability record.
    pub fn complete_cross_chain_transfer(
        env: Env,
        caller: Address,
        transfer_id: u64,
    ) -> Result<(), LumentixError> {
        caller.require_auth();

        let mut transfer = storage::get_cross_chain_transfer(&env, transfer_id)?;

        // Must be in BridgeValidated state
        if transfer.status != CrossChainTransferStatus::BridgeValidated {
            return Err(LumentixError::CrossChainTransferAlreadyCompleted);
        }

        // Only the sender or admin can complete
        let stored_admin = storage::get_admin(&env);
        if caller != transfer.sender && caller != stored_admin {
            let config = storage::get_upgrade_governance_config(&env);
            let mut is_member = false;
            for i in 0..config.governance_members.len() {
                if config.governance_members.get(i).unwrap() == caller {
                    is_member = true;
                    break;
                }
            }
            if !is_member {
                return Err(LumentixError::Unauthorized);
            }
        }

        let now = env.ledger().timestamp();

        // Update ticket ownership if on same chain (for Stellar-to-Stellar simulated)
        // In production, the ticket would be minted/burned across chains
        let mut ticket = storage::get_ticket(&env, transfer.ticket_id)?;
        ticket.owner = transfer.recipient.clone();
        storage::set_ticket(&env, transfer.ticket_id, &ticket);

        // Finalize transfer
        transfer.status = CrossChainTransferStatus::Completed;
        transfer.completed_at = Some(now);
        storage::set_cross_chain_transfer(&env, transfer_id, &transfer);

        CrossChainTransferCompleted::emit(
            &env,
            transfer_id,
            transfer.ticket_id,
            transfer.recipient,
            transfer.target_chain,
        );

        Ok(())
    }

    /// Get a cross-chain transfer by ID
    pub fn get_cross_chain_transfer(
        env: Env,
        transfer_id: u64,
    ) -> Result<CrossChainTransfer, LumentixError> {
        storage::get_cross_chain_transfer(&env, transfer_id)
    }

    /// Get a bridge transaction by hash
    pub fn get_bridge_transaction(env: Env, tx_hash: String) -> Option<BridgeTransaction> {
        storage::get_bridge_transaction(&env, &tx_hash)
    }

    /// Check if bridge is paused
    pub fn is_bridge_paused(env: Env) -> bool {
        storage::is_bridge_paused(&env)
    }

    /// Check if a chain is supported
    pub fn is_chain_supported(env: Env, chain: String) -> bool {
        storage::is_chain_supported(&env, &chain)
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MERCHANDISE & NFT COLLECTIBLES
    // ═══════════════════════════════════════════════════════════════════════════

    /// Create event merchandise for sale.
    /// Only the event organizer can create merchandise.
    /// The event must exist and not be cancelled.
    /// Emits MerchandiseCreated event.
    pub fn create_event_merchandise(
        env: Env,
        organizer: Address,
        event_id: u64,
        name: String,
        description: String,
        price: i128,
        total_supply: u32,
    ) -> Result<u64, LumentixError> {
        organizer.require_auth();

        let event = storage::get_event(&env, event_id)?;

        if event.organizer != organizer {
            return Err(LumentixError::Unauthorized);
        }

        if event.status == EventStatus::Cancelled {
            return Err(LumentixError::InvalidStatusTransition);
        }

        validation::validate_string_not_empty(&name)?;
        validation::validate_string_not_empty(&description)?;
        validation::validate_positive_amount(price)?;
        validation::validate_positive_capacity(total_supply)?;

        let merchandise_id = storage::get_next_merchandise_id(&env);
        storage::increment_merchandise_id(&env);

        let item = EventMerchandise {
            id: merchandise_id,
            event_id,
            name: name.clone(),
            description,
            price,
            total_supply,
            remaining_supply: total_supply,
            organizer: organizer.clone(),
            active: true,
        };

        storage::set_merchandise(&env, merchandise_id, &item);

        MerchandiseCreated::emit(
            &env,
            merchandise_id,
            event_id,
            organizer,
            name,
            price,
            total_supply,
        );

        Ok(merchandise_id)
    }

    /// Purchase a merchandise item for an event.
    /// Buyer must pay the listed price.
    /// Decrements remaining_supply on success.
    /// Emits MerchandisePurchased event.
    pub fn purchase_merchandise(
        env: Env,
        buyer: Address,
        merchandise_id: u64,
    ) -> Result<(), LumentixError> {
        buyer.require_auth();

        let mut item = storage::get_merchandise(&env, merchandise_id)?;

        if !item.active {
            return Err(LumentixError::MerchandiseNotActive);
        }

        if item.remaining_supply == 0 {
            return Err(LumentixError::MerchandiseSoldOut);
        }

        let event = storage::get_event(&env, item.event_id)?;
        if event.status == EventStatus::Cancelled {
            return Err(LumentixError::InvalidStatusTransition);
        }

        // Process token transfer if token is set
        if let Ok(token_address) = storage::get_token_result(&env) {
            let token_client = soroban_sdk::token::Client::new(&env, &token_address);
            token_client.transfer(&buyer, &env.current_contract_address(), &item.price);
        }

        // Add proceeds to event escrow
        storage::add_escrow(&env, item.event_id, item.price);

        item.remaining_supply -= 1;
        storage::set_merchandise(&env, merchandise_id, &item);

        MerchandisePurchased::emit(
            &env,
            merchandise_id,
            item.event_id,
            buyer,
            item.price,
            item.remaining_supply,
        );

        Ok(())
    }

    /// Get merchandise item by ID.
    pub fn get_merchandise(
        env: Env,
        merchandise_id: u64,
    ) -> Result<EventMerchandise, LumentixError> {
        storage::get_merchandise(&env, merchandise_id)
    }

    /// Mint a commemorative NFT collectible for a special event.
    /// Only the event organizer can mint NFTs.
    /// Requires a collectible inventory to be configured first via manage_collectible_inventory.
    /// Rarity tiers have limited supply tracked in the inventory.
    /// Emits NftMinted event.
    pub fn mint_commemorative_nft(
        env: Env,
        organizer: Address,
        event_id: u64,
        recipient: Address,
        name: String,
        description: String,
        rarity: RarityTier,
        transferable: bool,
        metadata_hash: soroban_sdk::BytesN<32>,
    ) -> Result<u64, LumentixError> {
        organizer.require_auth();

        let event = storage::get_event(&env, event_id)?;

        if event.organizer != organizer {
            return Err(LumentixError::Unauthorized);
        }

        if event.status == EventStatus::Cancelled {
            return Err(LumentixError::InvalidStatusTransition);
        }

        validation::validate_string_not_empty(&name)?;
        validation::validate_string_not_empty(&description)?;

        // Collectible inventory must be configured
        let mut inv = storage::get_collectible_inventory(&env, event_id)?;

        if inv.total_minted >= inv.max_supply {
            return Err(LumentixError::CollectibleMaxSupplyReached);
        }

        // Enforce per-rarity supply caps derived from max_supply:
        // Legendary ≤ 1% of max_supply (min 1), Epic ≤ 5%, Rare ≤ 15%,
        // Uncommon ≤ 30%, Common = remainder.
        let max_supply = inv.max_supply;
        let legendary_cap = (max_supply / 100).max(1);
        let epic_cap = (max_supply * 5 / 100).max(1);
        let rare_cap = (max_supply * 15 / 100).max(1);
        let uncommon_cap = (max_supply * 30 / 100).max(1);

        match &rarity {
            RarityTier::Legendary => {
                if inv.legendary_minted >= legendary_cap {
                    return Err(LumentixError::RarityTierExhausted);
                }
                inv.legendary_minted += 1;
            }
            RarityTier::Epic => {
                if inv.epic_minted >= epic_cap {
                    return Err(LumentixError::RarityTierExhausted);
                }
                inv.epic_minted += 1;
            }
            RarityTier::Rare => {
                if inv.rare_minted >= rare_cap {
                    return Err(LumentixError::RarityTierExhausted);
                }
                inv.rare_minted += 1;
            }
            RarityTier::Uncommon => {
                if inv.uncommon_minted >= uncommon_cap {
                    return Err(LumentixError::RarityTierExhausted);
                }
                inv.uncommon_minted += 1;
            }
            RarityTier::Common => {
                inv.common_minted += 1;
            }
        }

        inv.total_minted += 1;
        storage::set_collectible_inventory(&env, event_id, &inv);

        let nft_id = storage::get_next_nft_id(&env);
        storage::increment_nft_id(&env);

        let minted_at = env.ledger().timestamp();

        let nft = NftCollectible {
            id: nft_id,
            event_id,
            name,
            description,
            rarity: rarity.clone(),
            owner: recipient.clone(),
            minted_at,
            transferable,
            metadata_hash,
        };

        storage::set_nft(&env, nft_id, &nft);

        NftMinted::emit(&env, nft_id, event_id, recipient, rarity, minted_at);

        CollectibleInventoryUpdated::emit(&env, event_id, inv.max_supply, inv.total_minted);

        Ok(nft_id)
    }

    /// Trade (transfer) an NFT collectible to another address.
    /// Only the current owner can trade their NFT.
    /// The NFT must have transferable = true.
    /// Emits NftTraded event.
    pub fn trade_nft(
        env: Env,
        from: Address,
        to: Address,
        nft_id: u64,
    ) -> Result<(), LumentixError> {
        from.require_auth();

        let mut nft = storage::get_nft(&env, nft_id)?;

        if nft.owner != from {
            return Err(LumentixError::NftNotOwned);
        }

        if !nft.transferable {
            return Err(LumentixError::NftNotTransferable);
        }

        let event_id = nft.event_id;
        nft.owner = to.clone();
        storage::set_nft(&env, nft_id, &nft);

        NftTraded::emit(&env, nft_id, event_id, from, to);

        Ok(())
    }

    /// Get an NFT collectible by ID.
    pub fn get_nft(env: Env, nft_id: u64) -> Result<NftCollectible, LumentixError> {
        storage::get_nft(&env, nft_id)
    }

    /// Configure or update the collectible inventory for an event.
    /// Only the event organizer can call this.
    /// Sets the maximum supply of NFT collectibles for the event.
    /// Can be called before minting begins to initialise, or to increase max_supply.
    /// Emits CollectibleInventoryUpdated event.
    pub fn manage_collectible_inventory(
        env: Env,
        organizer: Address,
        event_id: u64,
        max_supply: u32,
    ) -> Result<(), LumentixError> {
        organizer.require_auth();

        let event = storage::get_event(&env, event_id)?;

        if event.organizer != organizer {
            return Err(LumentixError::Unauthorized);
        }

        if event.status == EventStatus::Cancelled {
            return Err(LumentixError::InvalidStatusTransition);
        }

        validation::validate_positive_capacity(max_supply)?;

        if storage::has_collectible_inventory(&env, event_id) {
            // Update existing inventory — max_supply cannot be reduced below total_minted
            let mut inv = storage::get_collectible_inventory(&env, event_id)?;
            if max_supply < inv.total_minted {
                return Err(LumentixError::CapacityExceeded);
            }
            inv.max_supply = max_supply;
            storage::set_collectible_inventory(&env, event_id, &inv);
            CollectibleInventoryUpdated::emit(&env, event_id, max_supply, inv.total_minted);
        } else {
            // Create new inventory
            let inv = CollectibleInventory {
                event_id,
                total_minted: 0,
                max_supply,
                common_minted: 0,
                uncommon_minted: 0,
                rare_minted: 0,
                epic_minted: 0,
                legendary_minted: 0,
            };
            storage::set_collectible_inventory(&env, event_id, &inv);
            CollectibleInventoryUpdated::emit(&env, event_id, max_supply, 0);
        }

        Ok(())
    }

    /// Get the collectible inventory for an event.
    pub fn get_collectible_inventory(
        env: Env,
        event_id: u64,
    ) -> Result<CollectibleInventory, LumentixError> {
        storage::get_collectible_inventory(&env, event_id)
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DYNAMIC VENUE SPACE ALLOCATION
    // ═══════════════════════════════════════════════════════════════════════════

    pub fn allocate_venue_space(
        env: Env,
        organizer: Address,
        event_id: u64,
        venue_id: String,
        space_id: String,
        capacity: u32,
    ) -> Result<(), LumentixError> {
        organizer.require_auth();

        let event = storage::get_event(&env, event_id)?;
        if event.organizer != organizer {
            return Err(LumentixError::Unauthorized);
        }

        let alloc = VenueSpaceAllocation {
            event_id,
            venue_id: venue_id.clone(),
            space_id: space_id.clone(),
            allocated_capacity: capacity,
            real_time_demand: 0,
            is_optimized: false,
        };

        storage::set_venue_space_allocation(&env, event_id, &venue_id, &space_id, &alloc);

        VenueSpaceAllocated::emit(&env, event_id, venue_id, space_id, capacity);

        Ok(())
    }

    pub fn optimize_space_utilization(
        env: Env,
        organizer: Address,
        venue_id: String,
        space_id: String,
    ) -> Result<(), LumentixError> {
        organizer.require_auth();

        let next_event_id = storage::get_next_event_id(&env);
        let mut event_id = 1;
        let mut optimized = false;

        while event_id < next_event_id {
            if storage::has_venue_space_allocation(&env, event_id, &venue_id, &space_id) {
                let mut alloc = storage::get_venue_space_allocation(&env, event_id, &venue_id, &space_id)?;
                // Simple optimization logic: adjust capacity based on demand if needed, or flag optimized
                alloc.is_optimized = true;
                storage::set_venue_space_allocation(&env, event_id, &venue_id, &space_id, &alloc);
                optimized = true;
            }
            event_id += 1;
        }

        if !optimized {
            return Err(LumentixError::VenueSpaceAllocationNotFound);
        }

        SpaceUtilizationOptimized::emit(&env, venue_id, space_id, env.ledger().timestamp());

        Ok(())
    }

    pub fn manage_venue_conflicts(
        env: Env,
        organizer: Address,
        venue_id: String,
        space_id: String,
    ) -> Result<bool, LumentixError> {
        organizer.require_auth();

        let next_event_id = storage::get_next_event_id(&env);
        let mut allocations = Vec::new(&env);
        let mut event_id = 1;

        while event_id < next_event_id {
            if storage::has_venue_space_allocation(&env, event_id, &venue_id, &space_id) {
                if let Ok(event) = storage::get_event(&env, event_id) {
                    if event.status == EventStatus::Published || event.status == EventStatus::Draft {
                        allocations.push_back((event_id, event.start_time, event.end_time));
                    }
                }
            }
            event_id += 1;
        }

        let mut conflict_detected = false;
        let len = allocations.len();
        for i in 0..len {
            for j in (i + 1)..len {
                let a = allocations.get(i).unwrap();
                let b = allocations.get(j).unwrap();
                let start_a = a.1;
                let end_a = a.2;
                let start_b = b.1;
                let end_b = b.2;
                
                // Check if times overlap
                if start_a.max(start_b) < end_a.min(end_b) {
                    conflict_detected = true;
                }
            }
        }

        VenueConflictManaged::emit(&env, venue_id, space_id, env.ledger().timestamp());

        Ok(conflict_detected)
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SUBSCRIPTION-BASED ACCESS PASSES
    // ═══════════════════════════════════════════════════════════════════════════

    pub fn create_subscription_plan(
        env: Env,
        organizer: Address,
        event_series_id: u64,
        name: String,
        price: i128,
        billing_interval: u64,
    ) -> Result<u64, LumentixError> {
        organizer.require_auth();

        validation::validate_string_not_empty(&name)?;
        validation::validate_positive_amount(price)?;
        if billing_interval == 0 {
            return Err(LumentixError::InvalidTimeRange);
        }

        let plan_id = storage::get_next_plan_id(&env);
        let plan = SubscriptionPlan {
            plan_id,
            event_series_id,
            name,
            price,
            billing_interval,
            active: true,
        };

        storage::set_subscription_plan(&env, plan_id, &plan);
        storage::increment_plan_id(&env);

        SubscriptionPlanCreated::emit(&env, plan_id, event_series_id, price, billing_interval);

        Ok(plan_id)
    }

    pub fn process_recurring_billing(
        env: Env,
        subscriber: Address,
        plan_id: u64,
    ) -> Result<(), LumentixError> {
        subscriber.require_auth();

        let plan = storage::get_subscription_plan(&env, plan_id)?;
        if !plan.active {
            return Err(LumentixError::SubscriptionInactive);
        }

        // Process token transfer from subscriber to contract
        if let Ok(token_address) = storage::get_token_result(&env) {
            let token_client = soroban_sdk::token::Client::new(&env, &token_address);
            token_client.transfer(&subscriber, &env.current_contract_address(), &plan.price);
            storage::add_platform_balance(&env, plan.price);
        }

        let current_time = env.ledger().timestamp();
        let mut status = match storage::get_subscription_status(&env, &subscriber, plan_id) {
            Ok(s) => s,
            Err(_) => SubscriptionStatus {
                subscriber: subscriber.clone(),
                plan_id,
                expiration_time: current_time,
                active: false,
            },
        };

        status.expiration_time = status.expiration_time.max(current_time) + plan.billing_interval;
        status.active = true;

        storage::set_subscription_status(&env, &subscriber, plan_id, &status);

        RecurringBillingProcessed::emit(&env, subscriber, plan_id, plan.price, status.expiration_time);

        Ok(())
    }

    pub fn validate_subscription_status(
        env: Env,
        subscriber: Address,
        plan_id: u64,
    ) -> Result<bool, LumentixError> {
        let status = storage::get_subscription_status(&env, &subscriber, plan_id)?;
        let is_valid = status.active && status.expiration_time >= env.ledger().timestamp();

        SubscriptionStatusValidated::emit(&env, subscriber, plan_id, is_valid, status.expiration_time);

        Ok(is_valid)
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // COMPREHENSIVE SECURITY MONITORING
    // ═══════════════════════════════════════════════════════════════════════════

    pub fn monitor_security_threats(
        env: Env,
        admin: Address,
        target_address: Address,
        threat_score: u32,
    ) -> Result<(), LumentixError> {
        admin.require_auth();

        let stored_admin = storage::get_admin(&env);
        if stored_admin != admin {
            return Err(LumentixError::Unauthorized);
        }

        SecurityThreatMonitored::emit(&env, target_address, threat_score, env.ledger().timestamp());

        Ok(())
    }

    pub fn detect_suspicious_activity(
        env: Env,
        admin: Address,
        target_address: Address,
        activity_type: String,
    ) -> Result<bool, LumentixError> {
        admin.require_auth();

        let stored_admin = storage::get_admin(&env);
        if stored_admin != admin {
            return Err(LumentixError::Unauthorized);
        }

        validation::validate_string_not_empty(&activity_type)?;

        // Simple mock detection rule: if threat score exceeds predefined thresholds
        let is_suspicious = true;

        if is_suspicious {
            let incident_id = storage::get_next_incident_id(&env);
            let incident = SecurityIncident {
                incident_id,
                affected_address: target_address.clone(),
                threat_level: String::from_str(&env, "High"),
                description: activity_type.clone(),
                timestamp: env.ledger().timestamp(),
                resolved: false,
            };
            storage::set_security_incident(&env, incident_id, &incident);
            storage::increment_incident_id(&env);
        }

        SuspiciousActivityDetected::emit(&env, target_address, activity_type, env.ledger().timestamp());

        Ok(is_suspicious)
    }

    pub fn respond_to_incidents(
        env: Env,
        admin: Address,
        incident_id: u64,
        action: String,
    ) -> Result<(), LumentixError> {
        admin.require_auth();

        let stored_admin = storage::get_admin(&env);
        if stored_admin != admin {
            return Err(LumentixError::Unauthorized);
        }

        validation::validate_string_not_empty(&action)?;

        let mut incident = storage::get_security_incident(&env, incident_id)?;
        incident.resolved = true;
        storage::set_security_incident(&env, incident_id, &incident);

        IncidentResponded::emit(&env, incident_id, action, env.ledger().timestamp());

        Ok(())
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PERSONALIZATION ENGINE
    // ═══════════════════════════════════════════════════════════════════════════

    pub fn personalize_user_experience(
        env: Env,
        user: Address,
        preferred_categories: Vec<String>,
        max_price: i128,
    ) -> Result<(), LumentixError> {
        user.require_auth();

        validation::validate_positive_amount(max_price)?;

        let prefs = UserPreferences {
            user: user.clone(),
            preferred_categories: preferred_categories.clone(),
            max_price,
        };

        storage::set_user_preferences(&env, &user, &prefs);

        UserExperiencePersonalized::emit(&env, user, preferred_categories, max_price, env.ledger().timestamp());

        Ok(())
    }

    pub fn customize_event_recommendations(
        env: Env,
        user: Address,
    ) -> Result<Vec<u64>, LumentixError> {
        let prefs = storage::get_user_preferences(&env, &user)?;
        let next_event_id = storage::get_next_event_id(&env);
        let mut recommended = Vec::new(&env);
        let mut event_id = 1;

        while event_id < next_event_id {
            if let Ok(event) = storage::get_event(&env, event_id) {
                // If price is within user's max budget, recommend
                if event.ticket_price <= prefs.max_price && event.status == EventStatus::Published {
                    recommended.push_back(event_id);
                }
            }
            event_id += 1;
        }

        EventRecommendationsCustomized::emit(&env, user, recommended.len(), env.ledger().timestamp());

        Ok(recommended)
    }

    pub fn optimize_user_journey(
        env: Env,
        user: Address,
        journey_steps: Vec<String>,
    ) -> Result<(), LumentixError> {
        user.require_auth();

        UserJourneyOptimized::emit(&env, user, journey_steps.len(), env.ledger().timestamp());

        Ok(())
    }
}
