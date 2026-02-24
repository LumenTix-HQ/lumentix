#![no_std]

mod error;
mod storage;
mod types;
mod validation;

#[cfg(test)]
mod test;

pub use error::LumentixError;
pub use types::*;
use soroban_sdk::{ contract, contractimpl, symbol_short, Address, Env, Symbol, Vec };

use soroban_sdk::{contract, contractimpl, Address, Env, String};

#[contract]
pub struct LumentixContract;

#[contractimpl]
impl LumentixContract {
    /// Initialize the contract with admin address
    pub fn initialize(env: Env, admin: Address) -> Result<(), LumentixError> {
        validation::validate_address(&admin)?;

        if storage::is_initialized(&env) {
            return Err(LumentixError::AlreadyInitialized);
        }

        storage::set_admin(&env, &admin);
        storage::set_initialized(&env);

        Ok(())
    }

    /// Create a new event
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

        if !storage::is_initialized(&env) {
            return Err(LumentixError::NotInitialized);
        }

        // Input validation
        validation::validate_address(&organizer)?;
        validation::validate_positive_amount(ticket_price)?;
        validation::validate_positive_capacity(max_tickets)?;
        validation::validate_time_range(start_time, end_time)?;
        validation::validate_string_not_empty(&name)?;

        let event_id = storage::get_next_event_id(&env);

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
        storage::increment_event_id(&env);

        Ok(event_id)
    }

    /// Update event status with validation
    pub fn update_event_status(
        env: Env,
        event_id: u64,
        new_status: EventStatus,
        caller: Address,
    ) -> Result<(), LumentixError> {
        caller.require_auth();

        if !storage::is_initialized(&env) {
            return Err(LumentixError::NotInitialized);
        }

        validation::validate_address(&caller)?;

        let mut event = storage::get_event(&env, event_id)?;

        if event.organizer != caller {
            return Err(LumentixError::Unauthorized);
        }

        // Validate state transitions
        let valid_transition = match (&event.status, &new_status) {
            (EventStatus::Draft, EventStatus::Published) => true,
            (EventStatus::Published, EventStatus::Completed) => {
                // Can only complete after end time
                env.ledger().timestamp() >= event.end_time
            }
            (EventStatus::Published, EventStatus::Cancelled) => true,
            _ => false,
        };

        if !valid_transition {
            return Err(LumentixError::InvalidStatusTransition);
        }

        event.status = new_status.clone();
        storage::set_event(&env, event_id, &event);

        env.events().publish(
            (soroban_sdk::symbol_short!("status"),),
            (event_id, new_status),
        );

        Ok(())
    }

    /// Purchase a ticket for an event
    pub fn purchase_ticket(
        env: Env,
        buyer: Address,
        event_id: u64,
        payment_amount: i128,
    ) -> Result<u64, LumentixError> {
        buyer.require_auth();

        if !storage::is_initialized(&env) {
            return Err(LumentixError::NotInitialized);
        }

        validation::validate_address(&buyer)?;
        validation::validate_positive_amount(payment_amount)?;

        let mut event = storage::get_event(&env, event_id)?;

        // Validate event status
        if event.status != EventStatus::Active {
            return Err(LumentixError::InvalidStatusTransition);
        }

        // Check capacity
        if event.tickets_sold >= event.max_tickets {
            return Err(LumentixError::EventSoldOut);
        }

        // Validate payment amount
        if payment_amount < event.ticket_price {
            return Err(LumentixError::InsufficientFunds);
        }

        let ticket_id = storage::get_next_ticket_id(&env);

        let ticket = Ticket {
            id: ticket_id,
            event_id,
            owner: buyer.clone(),
            purchase_time: env.ledger().timestamp(),
            used: false,
            refunded: false,
        };

        storage::set_ticket(&env, ticket_id, &ticket);
        storage::increment_ticket_id(&env);

        // Update event
        event.tickets_sold += 1;
        storage::set_event(&env, event_id, &event);

        // Store payment in escrow
        storage::add_escrow(&env, event_id, payment_amount);

        Ok(ticket_id)
    }

    /// Use a ticket (mark as used)
    pub fn use_ticket(env: Env, ticket_id: u64, validator: Address) -> Result<(), LumentixError> {
        validator.require_auth();

        if !storage::is_initialized(&env) {
            return Err(LumentixError::NotInitialized);
        }

        validation::validate_address(&validator)?;

        let mut ticket = storage::get_ticket(&env, ticket_id)?;

        if ticket.used {
            return Err(LumentixError::TicketAlreadyUsed);
        }

        if ticket.refunded {
            return Err(LumentixError::RefundNotAllowed);
        }

        let event = storage::get_event(&env, ticket.event_id)?;

        // Only organizer can validate tickets
        if validator != event.organizer {
            return Err(LumentixError::Unauthorized);
        }

        ticket.used = true;
        storage::set_ticket(&env, ticket_id, &ticket);

        Ok(())
    }

    /// Cancel an event
    pub fn cancel_event(env: Env, organizer: Address, event_id: u64) -> Result<(), LumentixError> {
        organizer.require_auth();

        if !storage::is_initialized(&env) {
            return Err(LumentixError::NotInitialized);
        }

        validation::validate_address(&organizer)?;

        let mut event = storage::get_event(&env, event_id)?;

        if event.organizer != organizer {
            return Err(LumentixError::Unauthorized);
        }

        if event.status != EventStatus::Active {
            return Err(LumentixError::InvalidStatusTransition);
        }

        event.status = EventStatus::Cancelled;
        storage::set_event(&env, event_id, &event);

        Ok(())
    }

    /// Request refund for a ticket (only if event is cancelled)
    pub fn refund_ticket(env: Env, ticket_id: u64, buyer: Address) -> Result<(), LumentixError> {
        buyer.require_auth();

        if !storage::is_initialized(&env) {
            return Err(LumentixError::NotInitialized);
        }

        validation::validate_address(&buyer)?;

        let mut ticket = storage::get_ticket(&env, ticket_id)?;

        if ticket.owner != buyer {
            return Err(LumentixError::Unauthorized);
        }

        if ticket.used {
            return Err(LumentixError::TicketAlreadyUsed);
        }

        if ticket.refunded {
            return Err(LumentixError::RefundNotAllowed);
        }

        let event = storage::get_event(&env, ticket.event_id)?;

        if event.status != EventStatus::Cancelled {
            return Err(LumentixError::EventNotCancelled);
        }

        ticket.refunded = true;
        storage::set_ticket(&env, ticket_id, &ticket);

        // Deduct from escrow
        storage::deduct_escrow(&env, event.id, event.ticket_price)?;

        Ok(())
    }

    /// Release escrow funds to organizer (after event completion)
    pub fn release_escrow(
        env: Env,
        organizer: Address,
        event_id: u64,
    ) -> Result<i128, LumentixError> {
        organizer.require_auth();

        if !storage::is_initialized(&env) {
            return Err(LumentixError::NotInitialized);
        }

        validation::validate_address(&organizer)?;

        let event = storage::get_event(&env, event_id)?;

        if event.organizer != organizer {
            return Err(LumentixError::Unauthorized);
        }

        if event.status != EventStatus::Completed {
            return Err(LumentixError::InvalidStatusTransition);
        }

        let escrow_amount = storage::get_escrow(&env, event_id)?;

        if escrow_amount == 0 {
            return Err(LumentixError::EscrowAlreadyReleased);
        }

        storage::clear_escrow(&env, event_id);

        Ok(escrow_amount)
    }

    /// Complete an event (after end time)
    pub fn complete_event(
        env: Env,
        organizer: Address,
        event_id: u64,
    ) -> Result<(), LumentixError> {
        organizer.require_auth();

        if !storage::is_initialized(&env) {
            return Err(LumentixError::NotInitialized);
        }

        validation::validate_address(&organizer)?;

        let mut event = storage::get_event(&env, event_id)?;

        if event.organizer != organizer {
            return Err(LumentixError::Unauthorized);
        }

        if event.status != EventStatus::Active {
            return Err(LumentixError::InvalidStatusTransition);
        }

        let current_time = env.ledger().timestamp();
        if current_time < event.end_time {
            return Err(LumentixError::InvalidStatusTransition);
        }

        event.status = EventStatus::Completed;
        storage::set_event(&env, event_id, &event);

        Ok(())
    }

    /// Get event details
    pub fn get_event(env: Env, event_id: u64) -> Result<Event, LumentixError> {
        if !storage::is_initialized(&env) {
            return Err(LumentixError::NotInitialized);
        }

        storage::get_event(&env, event_id)
    }

    /// Get ticket details
    pub fn get_ticket(env: Env, ticket_id: u64) -> Result<Ticket, LumentixError> {
        if !storage::is_initialized(&env) {
            return Err(LumentixError::NotInitialized);
        }

        storage::get_ticket(&env, ticket_id)
    }

    /// Get admin address
    pub fn get_admin(env: Env) -> Result<Address, LumentixError> {
        if !storage::is_initialized(&env) {
            return Err(LumentixError::NotInitialized);
        }

        Ok(storage::get_admin(&env))
    }

    /// Set platform fee in basis points (only admin can call)
    /// fee_bps: basis points (e.g., 250 = 2.5%, max 10000 = 100%)
    pub fn set_platform_fee(env: Env, admin: Address, fee_bps: u32) -> Result<(), LumentixError> {
        admin.require_auth();

        if !storage::is_initialized(&env) {
            return Err(LumentixError::NotInitialized);
        }

        validation::validate_address(&admin)?;

        // Verify caller is admin
        if admin != storage::get_admin(&env) {
            return Err(LumentixError::Unauthorized);
        }

        // Validate fee is within bounds (0-10000 basis points = 0-100%)
        if fee_bps > 10000 {
            return Err(LumentixError::InvalidPlatformFee);
        }

        storage::set_platform_fee_bps(&env, fee_bps);

        env.events()
            .publish((soroban_sdk::symbol_short!("fee_set"),), (fee_bps,));

        Ok(())
    }

    /// Get platform fee in basis points
    pub fn get_platform_fee(env: Env) -> u32 {
        storage::get_platform_fee_bps(&env)
    }

    /// Withdraw accumulated platform fees (only admin can call)
    pub fn withdraw_platform_fees(env: Env, admin: Address) -> Result<i128, LumentixError> {
        admin.require_auth();

        if !storage::is_initialized(&env) {
            return Err(LumentixError::NotInitialized);
        }

        validation::validate_address(&admin)?;

        // Verify caller is admin
        if admin != storage::get_admin(&env) {
            return Err(LumentixError::Unauthorized);
        }

        let balance = storage::get_platform_balance(&env);

        if balance <= 0 {
            return Err(LumentixError::NoPlatformFees);
        }

        storage::clear_platform_balance(&env);

        env.events()
            .publish((soroban_sdk::symbol_short!("fee_wdrw"),), (balance,));

        Ok(balance)
    }

    /// Get current platform balance
    pub fn get_platform_balance(env: Env) -> i128 {
        storage::get_platform_balance(&env)
    }
}

mod contract;
mod events;
mod models;

#[cfg(test)]
mod tests;

pub use contract::TicketContract;
pub use events::TransferEvent;
pub use models::Ticket;
