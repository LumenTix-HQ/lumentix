<<<<<<< adminSetup
use std::collections::HashMap;
use std::cell::RefCell;
use serde::{Serialize, Deserialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Address(pub String);

impl Address {
    pub fn from_str(s: &str) -> Self {
        Address(s.to_string())
    }
    // stub for auth check; in real contract this would verify signature
    pub fn require_auth(&self) {}
}

#[derive(Clone)]
pub struct Env {
    pub ledger_timestamp: i128,
    pub instance: RefCell<HashMap<String, Address>>,
    pub storage: RefCell<HashMap<String, i128>>,
}

impl Default for Env {
    fn default() -> Self {
        Env {
            ledger_timestamp: 1_700_000_000, // arbitrary default
            instance: RefCell::new(HashMap::new()),
            storage: RefCell::new(HashMap::new()),
        }
    }
}

pub struct AdminContract;

const ORGANIZER_TTL_SECS: i128 = 60 * 60 * 24 * 365; // 1 year

impl AdminContract {
    pub fn initialize(env: &Env, admin: Address) {
        if env.instance.borrow().contains_key("admin") {
            panic!("contract already initialized");
        }
        admin.require_auth();
        env.instance.borrow_mut().insert("admin".into(), admin);
    }

    pub fn set_admin(env: &Env, new_admin: Address) {
        let current = env.instance.borrow().get("admin").cloned().expect("admin not set");
        current.require_auth();
        env.instance.borrow_mut().insert("admin".into(), new_admin);
    }

    pub fn get_admin(env: &Env) -> Address {
        env.instance.borrow().get("admin").cloned().expect("admin not set")
    }

    pub fn add_organizer(env: &Env, organizer: Address) {
        let admin = env.instance.borrow().get("admin").cloned().expect("admin not set");
        admin.require_auth();
        let expiry = env.ledger_timestamp + ORGANIZER_TTL_SECS;
        env.storage.borrow_mut().insert(organizer.0.clone(), expiry);
    }

    pub fn is_organizer(env: &Env, addr: Address) -> bool {
        if let Some(expiry) = env.storage.borrow().get(&addr.0) {
            return *expiry > env.ledger_timestamp;
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_organizer_false_when_none() {
        let env = Env::default();
        let addr = Address::from_str("org1");
        assert_eq!(AdminContract::is_organizer(&env, addr), false);
    }

    #[test]
    fn is_organizer_true_when_expiry_future() {
        let mut env = Env::default();
        env.ledger_timestamp = 1_000;
        let addr = Address::from_str("org2");
        let expiry = env.ledger_timestamp + ORGANIZER_TTL_SECS;
        env.storage.borrow_mut().insert(addr.0.clone(), expiry);
        assert_eq!(AdminContract::is_organizer(&env, addr), true);
    }

    #[test]
    fn get_admin_returns_set_admin() {
        let env = Env::default();
        let admin = Address::from_str("admin1");
        env.instance.borrow_mut().insert("admin".into(), admin.clone());
        let got = AdminContract::get_admin(&env);
        assert_eq!(got, admin);
    }
}
=======
#![no_std]

mod contract;
mod events;
mod models;

#[cfg(test)]
mod tests;

pub use contract::TicketContract;
pub use events::TransferEvent;
pub use models::Ticket;
>>>>>>> main
