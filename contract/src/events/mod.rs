#![allow(deprecated)]

use soroban_sdk::{symbol_short, Address, Env, String, Symbol};

/// A type for transfer of event
pub struct TransferEvent;

impl TransferEvent {
    pub fn emit(env: &Env, ticket_id: Symbol, from: Address, to: Address) {
        env.events()
            .publish((symbol_short!("transfer"),), (ticket_id, from, to));
    }
}

/// Event emitted when a ticket is checked in (validated)
pub struct CheckInEvent;

impl CheckInEvent {
    pub fn emit(env: &Env, ticket_id: Symbol, validator: Address, event_id: Symbol) {
        env.events().publish(
            (symbol_short!("checkin"),),
            (ticket_id, validator, event_id),
        );
    }
}

/// Event emitted when a new event is created
pub struct EventCreated;

impl EventCreated {
    #[allow(clippy::too_many_arguments)]
    pub fn emit(
        env: &Env,
        event_id: u64,
        organizer: Address,
        name: String,
        ticket_price: i128,
        max_tickets: u32,
        start_time: u64,
        end_time: u64,
    ) {
        env.events().publish(
            (symbol_short!("evtcreate"),),
            (
                event_id,
                organizer,
                name,
                ticket_price,
                max_tickets,
                start_time,
                end_time,
            ),
        );
    }
}

/// Event emitted when platform fee is updated
pub struct PlatformFeeUpdated;

impl PlatformFeeUpdated {
    pub fn emit(env: &Env, admin: Address, old_fee_bps: u32, new_fee_bps: u32) {
        env.events().publish(
            (symbol_short!("feeupdate"),),
            (admin, old_fee_bps, new_fee_bps),
        );
    }
}

/// Event emitted when an organizer cancels a published event.
pub struct EventCancelled;

impl EventCancelled {
    pub fn emit(env: &Env, event_id: u64, organizer: Address, tickets_sold: u32) {
        env.events().publish(
            (symbol_short!("evcncld"),),
            (event_id, organizer, tickets_sold),
        );
    }
}

/// Event emitted when an event status transitions
pub struct EventStatusChanged;

impl EventStatusChanged {
    pub fn emit(
        env: &Env,
        event_id: u64,
        caller: Address,
        old_status: crate::types::EventStatus,
        new_status: crate::types::EventStatus,
    ) {
        env.events().publish(
            (symbol_short!("stschng"),),
            (event_id, caller, old_status, new_status),
        );
    }
}

/// Event emitted when an event is completed
pub struct EventCompleted;

impl EventCompleted {
    pub fn emit(env: &Env, event_id: u64, organizer: Address, tickets_sold: u32) {
        env.events().publish(
            (symbol_short!("evtcmpl"),),
            (event_id, organizer, tickets_sold),
        );
    }
}

/// Event emitted when platform fees are withdrawn
pub struct PlatformFeesWithdrawn;

impl PlatformFeesWithdrawn {
    pub fn emit(env: &Env, admin: Address, amount: i128) {
        env.events()
            .publish((symbol_short!("feewith"),), (admin, amount));
    }
}

/// Event emitted when admin address is changed
pub struct AdminChanged;

impl AdminChanged {
    pub fn emit(env: &Env, caller: Address, old_admin: Address, new_admin: Address) {
        env.events()
            .publish((symbol_short!("admchng"),), (caller, old_admin, new_admin));
    }
}

/// Event emitted when an event is updated
pub struct EventUpdated;

impl EventUpdated {
    #[allow(clippy::too_many_arguments)]
    pub fn emit(
        env: &Env,
        event_id: u64,
        organizer: Address,
        name: String,
        description: String,
        location: String,
        start_time: u64,
        end_time: u64,
        ticket_price: i128,
        max_tickets: u32,
    ) {
        env.events().publish(
            (symbol_short!("evtupdt"),),
            (
                event_id,
                organizer,
                name,
                description,
                location,
                start_time,
                end_time,
                ticket_price,
                max_tickets,
            ),
        );
    }
}

pub struct TicketPurchased;

impl TicketPurchased {
    pub fn emit(
        env: &Env,
        ticket_id: u64,
        event_id: u64,
        buyer: Address,
        amount: i128,
        platform_fee: i128,
        organizer_amount: i128,
    ) {
        env.events().publish(
            (symbol_short!("tktbuy"),),
            (
                ticket_id,
                event_id,
                buyer,
                amount,
                platform_fee,
                organizer_amount,
            ),
        );
    }
}

/// Event emitted when a ticket is transferred from one owner to another
pub struct TicketTransferred;

impl TicketTransferred {
    pub fn emit(env: &Env, ticket_id: u64, from: Address, to: Address, event_id: u64) {
        env.events().publish(
            (symbol_short!("tkttrans"),),
            (ticket_id, from, to, event_id),
        );
    }
}

/// Event emitted when a ticket is marked as used (checked in)
pub struct TicketUsed;

impl TicketUsed {
    pub fn emit(env: &Env, ticket_id: u64, event_id: u64, owner: Address, caller: Address) {
        env.events().publish(
            (symbol_short!("tktused"),),
            (ticket_id, event_id, owner, caller),
        );
    }
}

/// Event emitted when a ticket is refunded
pub struct TicketRefunded;

impl TicketRefunded {
    pub fn emit(env: &Env, ticket_id: u64, event_id: u64, buyer: Address, refund_amount: i128) {
        env.events().publish(
            (symbol_short!("tktrefnd"),),
            (ticket_id, event_id, buyer, refund_amount),
        );
    }
}

/// Event emitted when escrow funds are released to an organizer
pub struct EscrowReleased;

impl EscrowReleased {
    pub fn emit(env: &Env, event_id: u64, organizer: Address, amount: i128) {
        env.events()
            .publish((symbol_short!("escrwrel"),), (event_id, organizer, amount));
    }
}
