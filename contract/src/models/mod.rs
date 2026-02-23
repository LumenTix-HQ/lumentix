use soroban_sdk::{contracttype, Address, Symbol, Vec};

#[contracttype]
#[derive(Clone)]
pub struct Ticket {
    pub id: Symbol,
    pub event_id: Symbol,
    pub owner: Address,
    pub is_used: bool,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Ticket(Symbol),
    EscrowConfig(Symbol),
    EscrowApproval(Symbol, Address),
}

#[contracttype]
#[derive(Clone)]
pub struct EscrowConfig {
    pub event_id: Symbol,
    pub signers: Vec<Address>,
    pub threshold: u32,
}
