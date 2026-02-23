use std::collections::HashMap;
use std::cell::RefCell;
use serde::{Serialize, Deserialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Address(pub String);

impl Address {
    pub fn from_str(s: &str) -> Self {
        Address(s.to_string())
    }
    // stub for auth check; in real contract this would verify signature
    pub fn require_auth(&self) {}
}

#[derive(Clone)]
pub struct Env {
    pub ledger_timestamp: i128,
    pub instance: RefCell<HashMap<String, Address>>,
    pub storage: RefCell<HashMap<String, i128>>,
}

impl Default for Env {
    fn default() -> Self {
        Env {
            ledger_timestamp: 1_700_000_000, // arbitrary default
            instance: RefCell::new(HashMap::new()),
            storage: RefCell::new(HashMap::new()),
        }
    }
}

pub struct AdminContract;

const ORGANIZER_TTL_SECS: i128 = 60 * 60 * 24 * 365; // 1 year

impl AdminContract {
    pub fn initialize(env: &Env, admin: Address) {
        if env.instance.borrow().contains_key("admin") {
            panic!("contract already initialized");
        }
        admin.require_auth();
        env.instance.borrow_mut().insert("admin".into(), admin);
    }

    pub fn set_admin(env: &Env, new_admin: Address) {
        let current = env.instance.borrow().get("admin").cloned().expect("admin not set");
        current.require_auth();
        env.instance.borrow_mut().insert("admin".into(), new_admin);
    }

    pub fn get_admin(env: &Env) -> Address {
        env.instance.borrow().get("admin").cloned().expect("admin not set")
    }

    pub fn add_organizer(env: &Env, organizer: Address) {
        let admin = env.instance.borrow().get("admin").cloned().expect("admin not set");
        admin.require_auth();
        let expiry = env.ledger_timestamp + ORGANIZER_TTL_SECS;
        env.storage.borrow_mut().insert(organizer.0.clone(), expiry);
    }

    pub fn is_organizer(env: &Env, addr: Address) -> bool {
        if let Some(expiry) = env.storage.borrow().get(&addr.0) {
            return *expiry > env.ledger_timestamp;
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_organizer_false_when_none() {
        let env = Env::default();
        let addr = Address::from_str("org1");
        assert_eq!(AdminContract::is_organizer(&env, addr), false);
    }

    #[test]
    fn is_organizer_true_when_expiry_future() {
        let mut env = Env::default();
        env.ledger_timestamp = 1_000;
        let addr = Address::from_str("org2");
        let expiry = env.ledger_timestamp + ORGANIZER_TTL_SECS;
        env.storage.borrow_mut().insert(addr.0.clone(), expiry);
        assert_eq!(AdminContract::is_organizer(&env, addr), true);
    }

    #[test]
    fn get_admin_returns_set_admin() {
        let env = Env::default();
        let admin = Address::from_str("admin1");
        env.instance.borrow_mut().insert("admin".into(), admin.clone());
        let got = AdminContract::get_admin(&env);
        assert_eq!(got, admin);
    }
}
#![no_std]

mod error;
mod storage;
mod types;
mod validation;

#[cfg(test)]
mod test;

pub use contract::TicketContract;
pub use events::TransferEvent;
pub use models::Ticket;
pub use error::LumentixError;
pub use types::*;

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
            status: EventStatus::Active,
        };
        
        storage::set_event(&env, event_id, &event);
        storage::increment_event_id(&env);
        
        Ok(event_id)
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
    pub fn use_ticket(
        env: Env,
        ticket_id: u64,
        validator: Address,
    ) -> Result<(), LumentixError> {
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
    pub fn cancel_event(
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
        
        event.status = EventStatus::Cancelled;
        storage::set_event(&env, event_id, &event);
        
        Ok(())
    }

    /// Request refund for a ticket (only if event is cancelled)
    pub fn refund_ticket(
        env: Env,
        ticket_id: u64,
        buyer: Address,
    ) -> Result<(), LumentixError> {
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
}
>>>>>>
