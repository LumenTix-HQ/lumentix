use soroban_sdk::{contracttype, Address, String};

/// Event status enum mirroring backend statuses
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EventStatus {
    Draft,
    Published,
    Completed,
    Cancelled,
}

/// Event structure
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Event {
    pub id: u64,
    pub organizer: Address,
    pub name: String,
    pub description: String,
    pub location: String,
    pub start_time: u64,
    pub end_time: u64,
    pub ticket_price: i128,
    pub max_tickets: u32,
    pub tickets_sold: u32,
    pub status: EventStatus,
}

/// Ticket structure
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Ticket {
    pub id: u64,
    pub event_id: u64,
    pub owner: Address,
    pub purchase_time: u64,
    pub used: bool,
    pub refunded: bool,
}
