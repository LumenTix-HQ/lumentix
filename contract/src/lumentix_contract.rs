#![allow(clippy::too_many_arguments)]

use crate::error::LumentixError;
use crate::events::{
    AdminChanged, EscrowReleased, EventCancelled, EventCompleted, EventCreated, EventStatusChanged,
    EventUpdated, FundsDeposited, FundsWithdrawn, PlatformFeeUpdated, PlatformFeesWithdrawn, ProtocolFeeQueried,
    TicketPurchased, TicketRefunded, TicketTransferred, TicketUsed,
};
use crate::storage;
use crate::types::{Event, EventStatus, Ticket, PERSISTENT_LIFETIME};
use crate::validation;
use soroban_sdk::{contract, contractimpl, Address, Env, String, Vec};

#[contract]
pub struct LumentixContract;

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
        EventStatusChanged::emit(&env, event_id, caller, old_status, new_status);

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

        // Check capacity — reject when sold out
        if event.tickets_sold >= event.max_tickets {
            return Err(LumentixError::EventSoldOut);
        }

        // Validate payment amount
        if amount < event.ticket_price {
            return Err(LumentixError::InsufficientFunds);
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
            owner: buyer,
            purchase_time: env.ledger().timestamp(),
            used: false,
            refunded: false,
        };

        storage::set_ticket(&env, ticket_id, &ticket);

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
        buyer: Address,
        event_id: u64,
        quantity: u32,
        total_amount: i128,
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

        // Validate total_amount matches expected price
        let expected_amount = event.ticket_price * quantity as i128;
        if total_amount != expected_amount {
            return Err(LumentixError::InsufficientFunds);
        }

        // Check availability for the requested quantity
        let available = event.max_tickets.saturating_sub(event.tickets_sold);
        if available < quantity {
            return Err(LumentixError::EventSoldOut);
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
            };

            storage::set_ticket(&env, ticket_id, &ticket);
            ticket_ids.push_back(ticket_id);

            // Emit event for each ticket
            TicketPurchased::emit(
                &env,
                ticket_id,
                event_id,
                buyer.clone(),
                event.ticket_price,
                platform_fee / quantity as i128,
                escrow_amount / quantity as i128,
            );
        }

        Ok(ticket_ids)
    }

    /// Mark a ticket as used (check-in at event).
    /// Only the event organizer can use tickets.
    pub fn use_ticket(env: Env, ticket_id: u64, caller: Address) -> Result<(), LumentixError> {
        caller.require_auth();

        let mut ticket = storage::get_ticket(&env, ticket_id)?;

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

        // Emit TicketTransferred event
        TicketTransferred::emit(&env, ticket_id, ticket.event_id, from, to);

        Ok(())
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
        storage::deduct_escrow(&env, ticket.event_id, event.ticket_price)?;

        // Mark ticket as refunded
        ticket.refunded = true;
        storage::set_ticket(&env, ticket_id, &ticket);

        // Decrement tickets_sold to free up capacity
        event.tickets_sold = event.tickets_sold.saturating_sub(1);
        storage::set_event(&env, ticket.event_id, &event);

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

        event.status = EventStatus::Cancelled;
        storage::set_event(&env, event_id, &event);
        EventCancelled::emit(&env, event_id, organizer, event.tickets_sold);

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

        event.status = EventStatus::Completed;
        storage::set_event(&env, event_id, &event);

        // Emit EventCompleted event
        EventCompleted::emit(&env, event_id, organizer, event.tickets_sold);

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

    /// Get ticket data by ID.
    pub fn get_ticket_info(env: Env, ticket_id: u64) -> Result<Ticket, LumentixError> {
        storage::get_ticket(&env, ticket_id)
    }

    /// Check whether a ticket is currently valid for entry.
    /// A ticket is valid only when it exists, has not been used or refunded,
    /// and its event is still published.
    pub fn get_ticket_validity(env: Env, ticket_id: u64) -> Result<bool, LumentixError> {
        let ticket = storage::get_ticket(&env, ticket_id)?;
        let event = storage::get_event(&env, ticket.event_id)?;

        Ok(!ticket.used && !ticket.refunded && event.status == EventStatus::Published)
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

    /// Get all refunded tickets for a specific event.
    /// Useful for organizers to track refund activity and for auditing after event cancellation.
    /// Returns an empty Vec if no refunded tickets exist for the event.
    pub fn get_refunded_tickets_by_event(
        env: Env,
        event_id: u64,
    ) -> Result<Vec<Ticket>, LumentixError> {
        // Verify the event exists
        let _ = storage::get_event(&env, event_id)?;

        let mut refunded_tickets = Vec::new(&env);
        let next_ticket_id = storage::get_next_ticket_id(&env);
        let mut ticket_id: u64 = 1;

        // Iterate through all tickets
        while ticket_id < next_ticket_id {
            if let Ok(ticket) = storage::get_ticket(&env, ticket_id) {
                // Check if ticket belongs to this event and is refunded
                if ticket.event_id == event_id && ticket.refunded {
                    refunded_tickets.push_back(ticket);
                }
            }
            ticket_id += 1;
        }

        Ok(refunded_tickets)
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
    pub fn change_admin(env: Env, admin: Address, new_admin: Address) -> Result<(), LumentixError> {
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

        // Emit AdminChanged event
        AdminChanged::emit(&env, admin, old_admin, new_admin);

        Ok(())
    }

    /// Check if the contract has been initialized.
    /// Returns true if initialized, false otherwise.
    /// No auth required - useful for frontends and deployment scripts.
    pub fn get_is_initialized(env: Env) -> bool {
        storage::is_initialized(&env)
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
}
