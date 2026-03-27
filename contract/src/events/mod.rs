#![allow(deprecated)]

use soroban_sdk::{symbol_short, Address, Env, Symbol};

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
