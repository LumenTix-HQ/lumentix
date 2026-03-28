#![allow(clippy::too_many_arguments)]

use crate::error::LumentixError;
use crate::events::{
    EventCancelled, EventCompleted, EventCreated, EventStatusChanged, PlatformFeeUpdated,
    PlatformFeesWithdrawn,
};
use crate::storage;
use crate::types::{Event, EventStatus, Ticket};
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

        Ok(ticket_id)
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

        Ok(escrow_balance)
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

    /// Extend the TTL of an event. Only the organizer can call this.
    pub fn bump_event_ttl(env: Env, event_id: u64) -> Result<(), LumentixError> {
        let event = storage::get_event(&env, event_id)?;

        // Require authorization from the organizer
        event.organizer.require_auth();

        // Accessing storage via `get_event` automatically extends TTL based on storage.rs logic.
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

    /// Get the contract admin address.
    /// Returns the admin address if the contract is initialized.
    /// No auth required - provides transparency.
    pub fn get_admin(env: Env) -> Result<Address, LumentixError> {
        if !storage::is_initialized(&env) {
            return Err(LumentixError::NotInitialized);
        }
        Ok(storage::get_admin(&env))
    }
}
