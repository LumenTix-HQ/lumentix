use soroban_sdk::{symbol_short, Address, Env, Symbol};

//a type for tranfer of event
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
        env.events()
            .publish((symbol_short!("checkin"),), (ticket_id, validator, event_id));
    }
}
}
