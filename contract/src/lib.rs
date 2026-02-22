#![no_std]
use soroban_sdk::{ contract, contractimpl, symbol_short, Address, Env, Symbol, Vec };

// Contract constants
const EVENT_MANAGER: Symbol = symbol_short!("EVENT_MGR");
const EVENTS: Symbol = symbol_short!("EVENTS");
const REGISTRATIONS: Symbol = symbol_short!("REGS");

#[derive(Clone)]
#[contracttype]
pub struct Event {
    pub id: u64,
    pub name: String,
    pub description: String,
    pub price: i128,
    pub max_attendees: u32,
    pub current_attendees: u32,
    pub organizer: Address,
    pub is_active: bool,
    pub created_at: u64,
}

#[derive(Clone)]
#[contracttype]
pub struct Registration {
    pub event_id: u64,
    pub attendee: Address,
    pub payment_tx_hash: String,
    pub registered_at: u64,
}

#[contract]
pub struct LumentixContract;

#[contractimpl]
impl LumentixContract {
    /// Initialize the contract with an admin address
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&EVENT_MANAGER) {
            panic!("Contract already initialized");
        }

        admin.require_auth();
        env.storage().instance().set(&EVENT_MANAGER, &admin);
        env.storage().instance().set(&EVENTS, &Vec::<Event>::new(&env));
        env.storage().instance().set(&REGISTRATIONS, &Vec::<Registration>::new(&env));
    }

    /// Create a new event
    pub fn create_event(
        env: Env,
        name: String,
        description: String,
        price: i128,
        max_attendees: u32
    ) -> u64 {
        let admin = Self::get_admin(&env);
        admin.require_auth();

        let mut events = Self::get_events(&env);
        let event_id = (events.len() as u64) + 1;

        let event = Event {
            id: event_id,
            name,
            description,
            price,
            max_attendees,
            current_attendees: 0,
            organizer: admin,
            is_active: true,
            created_at: env.ledger().timestamp(),
        };

        events.push_back(event);
        env.storage().instance().set(&EVENTS, &events);

        event_id
    }

    /// Register for an event after payment verification
    pub fn register_for_event(env: Env, event_id: u64, payment_tx_hash: String) -> bool {
        let caller = env.current_contract_address();

        // Get the event
        let mut events = Self::get_events(&env);
        let event_index = events
            .iter()
            .position(|e| e.id == event_id)
            .unwrap_or_else(|| panic!("Event not found"));

        let event = events.get(event_index).unwrap();

        // Check if event is active and has space
        if !event.is_active {
            panic!("Event is not active");
        }

        if event.current_attendees >= event.max_attendees {
            panic!("Event is full");
        }

        // Check if already registered
        let registrations = Self::get_registrations(&env);
        if registrations.iter().any(|r| r.event_id == event_id && r.attendee == caller) {
            panic!("Already registered for this event");
        }

        // Create registration
        let registration = Registration {
            event_id,
            attendee: caller,
            payment_tx_hash,
            registered_at: env.ledger().timestamp(),
        };

        let mut registrations = Self::get_registrations(&env);
        registrations.push_back(registration);
        env.storage().instance().set(&REGISTRATIONS, &registrations);

        // Update event attendee count
        let mut event = events.get(event_index).unwrap();
        event.current_attendees += 1;
        events.set(event_index, event);
        env.storage().instance().set(&EVENTS, &events);

        true
    }

    /// Get all events
    pub fn get_events(env: Env) -> Vec<Event> {
        env.storage()
            .instance()
            .get(&EVENTS)
            .unwrap_or_else(|| Vec::<Event>::new(&env))
    }

    /// Get event by ID
    pub fn get_event(env: Env, event_id: u64) -> Event {
        let events = Self::get_events(&env);
        events
            .iter()
            .find(|e| e.id == event_id)
            .cloned()
            .unwrap_or_else(|| panic!("Event not found"))
    }

    /// Get registrations for an event
    pub fn get_event_registrations(env: Env, event_id: u64) -> Vec<Registration> {
        let registrations = Self::get_registrations(&env);
        registrations
            .iter()
            .filter(|r| r.event_id == event_id)
            .cloned()
            .collect()
    }

    /// Get user's registrations
    pub fn get_user_registrations(env: Env, user: Address) -> Vec<Registration> {
        let registrations = Self::get_registrations(&env);
        registrations
            .iter()
            .filter(|r| r.attendee == user)
            .cloned()
            .collect()
    }

    /// Update event status (admin only)
    pub fn update_event_status(env: Env, event_id: u64, is_active: bool) {
        let admin = Self::get_admin(&env);
        admin.require_auth();

        let mut events = Self::get_events(&env);
        let event_index = events
            .iter()
            .position(|e| e.id == event_id)
            .unwrap_or_else(|| panic!("Event not found"));

        let mut event = events.get(event_index).unwrap();
        event.is_active = is_active;
        events.set(event_index, event);
        env.storage().instance().set(&EVENTS, &events);
    }

    /// Helper function to get admin address
    fn get_admin(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&EVENT_MANAGER)
            .unwrap_or_else(|| panic!("Contract not initialized"))
    }

    /// Helper function to get registrations
    fn get_registrations(env: &Env) -> Vec<Registration> {
        env.storage()
            .instance()
            .get(&REGISTRATIONS)
            .unwrap_or_else(|| Vec::<Registration>::new(env))
    }
}
