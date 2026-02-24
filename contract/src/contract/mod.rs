use crate::events::TransferEvent;
use crate::models::Ticket;
use soroban_sdk::{contract, contractimpl, log, Address, Env, Symbol};

#[contract]
pub struct TicketContract;

/// contract implementation to issue ticket, get ticket, transfer ticket and also mark ticket as used
#[contractimpl]
impl TicketContract {
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

    /// Returns true if the given address is the current owner of the ticket.
    pub fn is_ticket_owner(env: Env, ticket_id: Symbol, address: Address) -> bool {
        let ticket = env
            .storage()
            .persistent()
            .get::<Symbol, Ticket>(&ticket_id)
            .expect("Ticket not found");

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