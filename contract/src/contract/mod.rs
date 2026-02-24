use soroban_sdk::{contract, contractimpl, log, Address, Env, Symbol, Vec};
use crate::models::{Ticket, DataKey, EscrowConfig};

#[contract]
pub struct TicketContract;

#[contractimpl]
impl TicketContract {
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