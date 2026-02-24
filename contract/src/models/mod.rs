use soroban_sdk::{contracttype, Address, Symbol};

#[contracttype]
#[derive(Clone)]
pub struct Ticket {
    pub id: Symbol,
    pub event_id: Symbol,
    pub owner: Address,
    pub is_used: bool,
}