#![allow(clippy::too_many_arguments)]

use crate::error::LumentixError;
use crate::events::{
    AccessibilityBooked, AccessibilityInventoryUpdated, AdminChanged, BatchTicketsPurchased,
    BatchTicketsTransferred, BatchTicketsUsed, EscrowReleased, EventCancelled, EventCapacityChanged,
    EventCompleted, EventCreated, EventCurrencySet, EventMetadataUpdated, EventSalesPaused,
    EventSalesResumed, EventStatusChanged, EventTimeExtended, EventUpdated, FundsDeposited,
    FundsWithdrawn, GenericEventStateTransition, OraclePriceUpdated, PlatformFeeRecipientUpdated,
    PlatformFeeUpdated, PlatformFeesWithdrawn, ProtocolFeeQueried, SeatHoldReleased, SeatSelected,
    TicketPurchased, TicketRefunded, TicketTransferred, TicketUsed, VenueLayoutCreated,
    VipTierCreated, VipTicketAssigned, WaitlistAvailabilityNotified, WaitlistJoined,
};
use crate::storage;
use crate::types::{
    AccessibilityBooking, AccessibilityInventory, CurrencyConfig, Event, EventStatus, Seat,
    Ticket, TicketTransferRecord, VenueLayout, VenueSection, VipTier, WaitlistOffer,
    PERSISTENT_LIFETIME,
};
use crate::validation;
use soroban_sdk::{contract, contractimpl, Address, Env, String, Vec, Map};

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
        EventStatusChanged::emit(&env, event_id, caller.clone(), old_status.clone(), new_status.clone());

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
    pub fn pause_ticket_sales(env: Env, event_id: u64, organizer: Address) -> Result<(), LumentixError> {
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
        Ok(())
    }

    /// Mark multiple tickets as used in a single transaction.
    /// Only the event organizer can use tickets. All tickets must belong to the same organizer's event.
    pub fn batch_use_tickets(env: Env, ticket_ids: Vec<u64>, caller: Address) -> Result<(), LumentixError> {
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
        GenericEventStateTransition::emit(&env, event_id, organizer, old_status, EventStatus::Cancelled);

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
        GenericEventStateTransition::emit(&env, event_id, organizer, old_status, EventStatus::Completed);

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
            let window = if window_seconds == 0 { 1 } else { window_seconds };
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

        Ok(Self::process_waitlist_queue_internal(&env, event_id, available))
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
    pub fn update_platform_fee_recipient(env: Env, admin: Address, new_admin: Address) -> Result<(), LumentixError> {
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
    pub fn get_event_attendees(
        env: Env,
        event_id: u64,
    ) -> Result<Vec<Address>, LumentixError> {
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
        let event_id = Self::create_event(env.clone(), organizer, name, ticket_price, max_tickets, start_time, end_time)?;
        
        let url_key = (soroban_sdk::symbol_short!("STRM_URL"), event_id);
        env.storage().persistent().set(&url_key, &streaming_url);
        env.storage().persistent().extend_ttl(&url_key, crate::types::PERSISTENT_LIFETIME, crate::types::PERSISTENT_LIFETIME);

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
        env.storage().persistent().extend_ttl(&access_key, crate::types::PERSISTENT_LIFETIME, crate::types::PERSISTENT_LIFETIME);
        Ok(())
    }

    /// Track virtual attendance of a user for a hybrid event.
    pub fn track_virtual_attendance(
        env: Env,
        event_id: u64,
        user: Address,
    ) -> Result<(), LumentixError> {
        user.require_auth();
        
        let access_key = (soroban_sdk::symbol_short!("STRM_ACC"), event_id, user.clone());
        let has_access: bool = env.storage().persistent().get(&access_key).unwrap_or(false);
        if !has_access {
            return Err(LumentixError::Unauthorized);
        }
        
        let att_key = (soroban_sdk::symbol_short!("VIRT_ATT"), event_id, user);
        env.storage().persistent().set(&att_key, &true);
        env.storage().persistent().extend_ttl(&att_key, crate::types::PERSISTENT_LIFETIME, crate::types::PERSISTENT_LIFETIME);
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

        AccessibilityInventoryUpdated::emit(&env, event_id, wheelchair_total, hearing_total, visual_total);

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

        AccessibilityInventoryUpdated::emit(&env, event_id, wheelchair_available, hearing_available, visual_available);

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

        OraclePriceUpdated::emit(&env, currency.clone(), new_oracle_price, env.ledger().timestamp());

        Self::convert_price(env, currency, to_currency, amount)
    }

    /// Get the currency config for a given code.
    pub fn get_currency_config(
        env: Env,
        code: String,
    ) -> Result<CurrencyConfig, LumentixError> {
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
    pub fn get_venue_layout(
        env: Env,
        event_id: u64,
    ) -> Result<VenueLayout, LumentixError> {
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
            if i < 62 { buf[i] = b; i += 1; }
        }
        buf[i] = b'-'; i += 1;
        let r_str = match row {
            0 => "0", 1 => "1", 2 => "2", 3 => "3", 4 => "4", 5 => "5",
            6 => "6", 7 => "7", 8 => "8", 9 => "9", 10 => "10",
            _ => "0",
        };
        for b in r_str.bytes() {
            if i < 63 { buf[i] = b; i += 1; }
        }
        buf[i] = b'-'; i += 1;
        let n_str = match number {
            0 => "0", 1 => "1", 2 => "2", 3 => "3", 4 => "4", 5 => "5",
            6 => "6", 7 => "7", 8 => "8", 9 => "9", 10 => "10",
            _ => "0",
        };
        for b in n_str.bytes() {
            if i < 64 { buf[i] = b; i += 1; }
        }
        let valid = core::str::from_utf8(&buf[..i]).unwrap_or("");
        String::from_str(env, valid)
    }
}
