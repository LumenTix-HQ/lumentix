use crate::events::{CheckInEvent, TransferEvent};
use crate::models::{EventAuth, Ticket, ValidatorKey};
use soroban_sdk::{contract, contractimpl, log, Address, Env, Symbol};

#[contract]
pub struct TicketContract;

/// contract implementation to issue ticket, get ticket, transfer ticket and also mark ticket as used
#[contractimpl]
impl TicketContract {
    /// Initialize an event with its organizer
    /// The organizer is automatically authorized to validate tickets
    pub fn init_event(env: Env, event_id: Symbol, organizer: Address) {
        organizer.require_auth();

        let event_auth = EventAuth {
            event_id: event_id.clone(),
            organizer: organizer.clone(),
        };

        env.storage().persistent().set(&event_id, &event_auth);

        log!(
            &env,
            "Event initialized: id={:?}, organizer={:?}",
            event_id,
            organizer
        );
    }

    /// Add an authorized validator (gate agent) for an event
    /// Only the event organizer can add validators
    pub fn add_validator(env: Env, event_id: Symbol, validator: Address) {
        let event_auth: EventAuth = env
            .storage()
            .persistent()
            .get(&event_id)
            .expect("Event not found");

        event_auth.organizer.require_auth();

        let validator_key = ValidatorKey {
            event_id: event_id.clone(),
            validator: validator.clone(),
        };

        env.storage().persistent().set(&validator_key, &true);

        log!(
            &env,
            "Validator added: event={:?}, validator={:?}",
            event_id,
            validator
        );
    }

    /// Remove an authorized validator for an event
    /// Only the event organizer can remove validators
    pub fn remove_validator(env: Env, event_id: Symbol, validator: Address) {
        let event_auth: EventAuth = env
            .storage()
            .persistent()
            .get(&event_id)
            .expect("Event not found");

        event_auth.organizer.require_auth();

        let validator_key = ValidatorKey {
            event_id: event_id.clone(),
            validator: validator.clone(),
        };

        env.storage().persistent().remove(&validator_key);

        log!(
            &env,
            "Validator removed: event={:?}, validator={:?}",
            event_id,
            validator
        );
    }

    /// Check if an address is authorized to validate tickets for an event
    pub fn is_authorized_validator(env: Env, event_id: Symbol, validator: Address) -> bool {
        // Check if this is the organizer
        if let Some(event_auth) = env.storage().persistent().get::<Symbol, EventAuth>(&event_id) {
            if event_auth.organizer == validator {
                return true;
            }
        }

        // Check if this is an authorized validator
        let validator_key = ValidatorKey {
            event_id,
            validator,
        };

        env.storage()
            .persistent()
            .get::<ValidatorKey, bool>(&validator_key)
            .unwrap_or(false)
    }

    /// Issue a new ticket to an owner for a specific event.
    pub fn issue_ticket(env: Env, ticket_id: Symbol, event_id: Symbol, owner: Address) -> Ticket {
        let ticket = Ticket {
            id: ticket_id.clone(),
            event_id,
            owner: owner.clone(),
            is_used: false,
        };

        env.storage().persistent().set(&ticket_id, &ticket);

        log!(&env, "Ticket issued: id={:?}, owner={:?}", ticket_id, owner);

        ticket
    }

    /// Retrieve a ticket by its ID.
    pub fn get_ticket(env: Env, ticket_id: Symbol) -> Option<Ticket> {
        env.storage().persistent().get::<Symbol, Ticket>(&ticket_id)
    }

    /// Transfer a ticket from one owner to another.
    ///
    /// Requires `from` to authorize the operation and ensures the ticket
    /// has not been used. Emits a TransferEvent on success.
    pub fn transfer_ticket(env: Env, ticket_id: Symbol, from: Address, to: Address) -> Ticket {
        from.require_auth();

        let ticket = env
            .storage()
            .persistent()
            .get::<Symbol, Ticket>(&ticket_id)
            .expect("Ticket not found");

        if ticket.owner != from {
            panic!("Unauthorized: not the ticket owner");
        }

        if ticket.is_used {
            panic!("Cannot transfer: ticket has already been used");
        }

        let updated_ticket = Ticket {
            id: ticket.id.clone(),
            event_id: ticket.event_id.clone(),
            owner: to.clone(),
            is_used: ticket.is_used,
        };

        env.storage().persistent().set(&ticket_id, &updated_ticket);

        TransferEvent::emit(&env, ticket_id.clone(), from, to);

        log!(
            &env,
            "Ticket transferred: id={:?}, from={:?}, to={:?}",
            ticket_id,
            ticket.owner,
            updated_ticket.owner
        );

        updated_ticket
    }

    /// Mark a ticket as used (prevents further transfers).
    pub fn mark_ticket_used(env: Env, ticket_id: Symbol) -> Ticket {
        let ticket = env
            .storage()
            .persistent()
            .get::<Symbol, Ticket>(&ticket_id)
            .expect("Ticket not found");

        let used_ticket = Ticket {
            id: ticket.id.clone(),
            event_id: ticket.event_id.clone(),
            owner: ticket.owner.clone(),
            is_used: true,
        };

        env.storage().persistent().set(&ticket_id, &used_ticket);

        log!(&env, "Ticket marked as used: id={:?}", ticket_id);

        used_ticket
    }

    /// Validate a ticket at event check-in (MAIN FEATURE)
    ///
    /// This function:
    /// 1. Verifies the validator is an authorized address for the event
    /// 2. Checks the ticket exists and is_used == false
    /// 3. Sets is_used = true in contract storage
    /// 4. Emits a CheckInEvent
    ///
    /// This replaces backend verification with a trustless on-chain solution.
    /// Note: In production, validator authentication should be handled by the calling context.
    pub fn validate_ticket(env: Env, ticket_id: Symbol, validator: Address) -> Ticket {
        // 1. Get the ticket - must exist
    /// Returns true if the given address is the current owner of the ticket.
    pub fn is_ticket_owner(env: Env, ticket_id: Symbol, address: Address) -> bool {
        let ticket = env
            .storage()
            .persistent()
            .get::<Symbol, Ticket>(&ticket_id)
            .expect("Ticket not found");

        // 2. Check if ticket is already used (prevent double check-in)
        if ticket.is_used {
            panic!("Ticket has already been used");
        }

        // 3. Verify validator is authorized for this event
        let is_authorized = Self::is_authorized_validator(
            env.clone(),
            ticket.event_id.clone(),
            validator.clone(),
        );

        if !is_authorized {
            panic!("Unauthorized: validator is not authorized for this event");
        }

        // 4. Mark ticket as used
        let validated_ticket = Ticket {
            id: ticket.id.clone(),
            event_id: ticket.event_id.clone(),
            owner: ticket.owner.clone(),
            is_used: true,
        };

        env.storage()
            .persistent()
            .set(&ticket_id, &validated_ticket);

        // 5. Emit CheckInEvent
        CheckInEvent::emit(
            &env,
            ticket_id.clone(),
            validator.clone(),
            ticket.event_id.clone(),
        );

        log!(
            &env,
            "Ticket validated: id={:?}, validator={:?}, event={:?}",
            ticket_id,
            validator,
            ticket.event_id
        );

        validated_ticket
    }
}
        ticket.owner == address
    }

    /// Returns the current owner and used status of a ticket as a tuple (Address, bool).
    pub fn get_ticket_status(env: Env, ticket_id: Symbol) -> (Address, bool) {
        let ticket = env
            .storage()
            .persistent()
            .get::<Symbol, Ticket>(&ticket_id)
            .expect("Ticket not found");

        (ticket.owner, ticket.is_used)
    }
    
}
