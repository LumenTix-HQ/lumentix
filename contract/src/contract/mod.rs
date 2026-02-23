use crate::events::TransferEvent;
use crate::models::{DataKey, EscrowConfig, Ticket};
use soroban_sdk::{contract, contractimpl, log, Address, Env, Symbol, Vec};

#[contract]
pub struct TicketContract;

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

        env.storage().persistent().set(&DataKey::Ticket(ticket_id.clone()), &ticket);

        log!(&env, "Ticket issued: id={:?}, owner={:?}", ticket_id, owner);

        ticket
    }

    /// Retrieve a ticket by its ID.
    pub fn get_ticket(env: Env, ticket_id: Symbol) -> Option<Ticket> {
        env.storage().persistent().get::<DataKey, Ticket>(&DataKey::Ticket(ticket_id))
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
            .get::<DataKey, Ticket>(&DataKey::Ticket(ticket_id.clone()))
            .expect("Ticket not found");

        if ticket.owner != from {
            panic!("Unauthorized: not ticket owner");
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

        env.storage().persistent().set(&DataKey::Ticket(ticket_id.clone()), &updated_ticket);

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
            .get::<DataKey, Ticket>(&DataKey::Ticket(ticket_id.clone()))
            .expect("Ticket not found");

        let used_ticket = Ticket {
            id: ticket.id.clone(),
            event_id: ticket.event_id.clone(),
            owner: ticket.owner.clone(),
            is_used: true,
        };

        env.storage().persistent().set(&DataKey::Ticket(ticket_id.clone()), &used_ticket);

        log!(&env, "Ticket marked as used: id={:?}", ticket_id);

        used_ticket
    }

    /// Configure the multi-sig escrow signers and threshold for an event.
    pub fn set_escrow_signers(
        env: Env,
        event_id: Symbol,
        signers: Vec<Address>,
        threshold: u32,
    ) {
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

        env.storage()
            .persistent()
            .set(&DataKey::EscrowApproval(event_id.clone(), signer.clone()), &true);

        log!(&env, "Release approved: event={:?}, signer={:?}", event_id, signer);
    }

    /// Revoke a previously given approval.
    pub fn revoke_approval(env: Env, event_id: Symbol, signer: Address) {
        signer.require_auth();

        env.storage()
            .persistent()
            .remove(&DataKey::EscrowApproval(event_id.clone(), signer.clone()));

        log!(&env, "Approval revoked: event={:?}, signer={:?}", event_id, signer);
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

        // Execute distribution logic here (e.g., token transfer to destination)
        // For now, we log and clear approvals.
        
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
                .remove(&DataKey::EscrowApproval(event_id.clone(), signer));
        }
    }
}
