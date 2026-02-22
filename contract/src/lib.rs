#![no_std]

extern crate alloc;
use alloc::string::String;
use alloc::string::ToString;
use soroban_sdk::{contractimpl, contracttype, Env, Address, Vec, Symbol};

#[contracttype]
pub struct Tier {
    pub price: i128,
    pub max_sponsors: u32,
    pub sponsor_count: u32,
}

pub struct SponsorsContract;

impl SponsorsContract {
    fn organizer_key(event_id: &str) -> (Symbol, String) {
        (Symbol::short("org"), event_id.to_string())
    }

    fn tier_key(event_id: &str, tier_id: &str) -> (Symbol, String, String) {
        (Symbol::short("tier"), event_id.to_string(), tier_id.to_string())
    }

    fn contributions_key(event_id: &str, tier_id: &str) -> (Symbol, String, String) {
        (Symbol::short("contrib"), event_id.to_string(), tier_id.to_string())
    }
}

#[contractimpl]
impl SponsorsContract {
    // Register a sponsor tier for an event. The first caller for a given event becomes
    // the organizer. Subsequent calls for the same event must be made by that organizer.
    pub fn register_sponsor_tier(
        env: Env,
        event_id: String,
        tier_id: String,
        price: i128,
        max_sponsors: u32,
    ) {
        let org_key = SponsorsContract::organizer_key(&event_id);
        if let Some(org) = env.storage().get::<(Symbol, String), Address>(&org_key) {
            env.require_auth(&org);
        } else {
            let invoker = env.invoker();
            env.storage().set(&org_key, &invoker);
        }

        let key = SponsorsContract::tier_key(&event_id, &tier_id);
        let tier = Tier {
            price,
            max_sponsors,
            sponsor_count: 0,
        };
        env.storage().set(&key, &tier);
    }

    // Contribute to a tier. This will verify capacity and record the sponsor address.
    pub fn contribute(env: Env, event_id: String, tier_id: String, sponsor: Address, amount: i128) {
        let key = SponsorsContract::tier_key(&event_id, &tier_id);
        let mut tier: Tier = env
            .storage()
            .get::<(Symbol, String, String), Tier>(&key)
            .expect("tier not found");

        if tier.sponsor_count >= tier.max_sponsors {
            panic!("tier is full");
        }

        if amount != tier.price {
            panic!("incorrect amount");
        }

        let ckey = SponsorsContract::contributions_key(&event_id, &tier_id);
        let mut list: Vec<Address> = env
            .storage()
            .get::<(Symbol, String, String), Vec<Address>>(&ckey)
            .unwrap_or_else(|| Vec::new(&env));

        list.push_back(sponsor.clone());
        env.storage().set(&ckey, &list);

        tier.sponsor_count = tier.sponsor_count.saturating_add(1);
        env.storage().set(&key, &tier);
    }

    // View function: returns (count, sponsors)
    pub fn get_tier_contributions(env: Env, event_id: String, tier_id: String) -> (u32, Vec<Address>) {
        let key = SponsorsContract::contributions_key(&event_id, &tier_id);
        let list: Vec<Address> = env
            .storage()
            .get::<(Symbol, String, String), Vec<Address>>(&key)
            .unwrap_or_else(|| Vec::new(&env));

        let count = list.len() as u32;
        (count, list)
    }
}

#[cfg(test)]
mod tests {
    // Tests that exercise contract behavior should use the Soroban SDK test
    // harness; they were intentionally omitted here during merge conflict
    // resolution to avoid introducing test harness-specific code.
}

