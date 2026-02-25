use crate::events::{CheckInEvent, TransferEvent};
use crate::models::{DataKey, EscrowConfig, EventAuth, Ticket, ValidatorKey};
use soroban_sdk::{contract, contractimpl, log, Address, Env, Symbol, Vec};

#[contract]
pub struct TicketContract;

/// Contract implementation to issue ticket, get ticket, transfer ticket and also mark ticket as used.
#[contractimpl]
impl TicketContract {
    /// Initialize an event with its organizer.
    /// The organizer is automatically authorized to validate tickets.
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

    /// Add an authorized validator (gate agent) for an event.
    /// Only the event organizer can add validators.
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

    /// Remove an authorized validator for an event.
    /// Only the event organizer can remove validators.
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

    /// Check if an address is authorized to validate tickets for an event.
    pub fn is_authorized_validator(env: Env, event_id: Symbol, validator: Address) -> bool {
        // Check if this is the organizer
        if let Some(event_auth) = env
            .storage()
            .persistent()
            .get::<Symbol, EventAuth>(&event_id)
        {
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

    /// Retrieve a ticket by its ID. Returns None if not found.
    pub fn get_ticket(env: Env, ticket_id: Symbol) -> Option<Ticket> {
        env.storage().persistent().get::<Symbol, Ticket>(&ticket_id)
    }

    /// Returns true if the given address is the current owner of the ticket.
    pub fn is_ticket_owner(env: Env, ticket_id: Symbol, address: Address) -> bool {
        let ticket = env
            .storage()
            .persistent()
            .get::<DataKey, Ticket>(&DataKey::Ticket(ticket_id))
            .expect("Ticket not found");

        ticket.owner == address
    }

    /// Returns the current owner and used status of a ticket as a tuple (Address, bool).
    pub fn get_ticket_status(env: Env, ticket_id: Symbol) -> (Address, bool) {
        let ticket = env
            .storage()
            .persistent()
            .get::<DataKey, Ticket>(&DataKey::Ticket(ticket_id))
            .expect("Ticket not found");

        (ticket.owner, ticket.is_used)
    }

    /// Mark a ticket as used.
    pub fn mark_ticket_used(env: Env, ticket_id: Symbol) {
        let mut ticket: Ticket = env
            .storage()
            .persistent()
            .get(&ticket_id)
            .expect("Ticket not found");

        ticket.is_used = true;
        env.storage().persistent().set(&ticket_id, &ticket);
    }

    /// Transfer a ticket from the current owner to a new owner.
    pub fn transfer_ticket(env: Env, ticket_id: Symbol, from: Address, to: Address) {
        from.require_auth();

        let mut ticket: Ticket = env
            .storage()
            .persistent()
            .get(&ticket_id)
            .expect("Ticket not found");

        if ticket.owner != from {
            panic!("Unauthorized: not the ticket owner");
        }

        ticket.owner = to.clone();
        env.storage().persistent().set(&ticket_id, &ticket);

        TransferEvent::emit(&env, ticket_id.clone(), from, to);

        log!(&env, "Ticket transferred: id={:?}", ticket_id);
    }

    /// Configure the multi-sig escrow signers and threshold for an event.
    pub fn set_escrow_signers(env: Env, event_id: Symbol, signers: Vec<Address>, threshold: u32) {
        if threshold == 0 || threshold > signers.len() {
            panic!("Invalid threshold: must be > 0 and <= number of signers");
        }

        let config = EscrowConfig {
            event_id: event_id.clone(),
            signers,
            threshold,
        };

        env.storage()
            .persistent()
            .set(&DataKey::EscrowConfig(event_id.clone()), &config);

        log!(&env, "Escrow signers set for event={:?}", event_id);
    }

    /// Approve the release of escrow funds for an event.
    pub fn approve_release(env: Env, event_id: Symbol, signer: Address) {
        signer.require_auth();

        let config = env
            .storage()
            .persistent()
            .get::<DataKey, EscrowConfig>(&DataKey::EscrowConfig(event_id.clone()))
            .expect("Escrow config not found");

        if !config.signers.iter().any(|s| s == signer) {
            panic!("Unauthorized: signer not in escrow group");
        }

        env.storage().persistent().set(
            &DataKey::EscrowApproval(event_id.clone(), signer.clone()),
            &true,
        );

        log!(
            &env,
            "Release approved: event={:?}, signer={:?}",
            event_id,
            signer
        );
    }

    /// Revoke a previously given approval.
    pub fn revoke_approval(env: Env, event_id: Symbol, signer: Address) {
        signer.require_auth();

        env.storage()
            .persistent()
            .remove(&DataKey::EscrowApproval(event_id.clone(), signer.clone()));

        log!(
            &env,
            "Approval revoked: event={:?}, signer={:?}",
            event_id,
            signer
        );
    }

    /// Validate a ticket at event check-in.
    ///
    /// This function:
    /// 1. Verifies the validator is an authorized address for the event
    /// 2. Checks the ticket exists and is_used == false
    /// 3. Sets is_used = true in contract storage
    /// 4. Emits a CheckInEvent
    pub fn validate_ticket(env: Env, ticket_id: Symbol, validator: Address) -> Ticket {
        // 1. Get the ticket - must exist
        let ticket: Ticket = env
            .storage()
            .persistent()
            .get(&ticket_id)
            .expect("Ticket not found");

        // 2. Check if ticket is already used (prevent double check-in)
        if ticket.is_used {
            panic!("Ticket has already been used");
        }

        // 3. Verify validator is authorized for this event
        let is_authorized =
            Self::is_authorized_validator(env.clone(), ticket.event_id.clone(), validator.clone());

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

    /// Check if the threshold is met and execute fund distribution.
    pub fn distribute_escrow(env: Env, event_id: Symbol, destination: Address) {
        let config = env
            .storage()
            .persistent()
            .get::<DataKey, EscrowConfig>(&DataKey::EscrowConfig(event_id.clone()))
            .expect("Escrow config not found");

        let mut approval_count = 0;
        for signer in config.signers.iter() {
            if env
                .storage()
                .persistent()
                .has(&DataKey::EscrowApproval(event_id.clone(), signer.clone()))
            {
                approval_count += 1;
            }
        }

        if approval_count < config.threshold {
            panic!("Threshold not met for escrow release");
        }

        log!(
            &env,
            "Escrow funds distributed: event={:?}, to={:?}",
            event_id,
            destination
        );

        // Clear approvals after successful distribution
        for signer in config.signers.iter() {
            env.storage()
                .persistent()
                .remove(&DataKey::EscrowApproval(event_id.clone(), signer.clone()));
        }
    }
}
