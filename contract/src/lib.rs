#![no_std]

<<<<<<< HEAD
extern crate alloc;
use alloc::string::String;
use alloc::string::ToString;
use soroban_sdk::{contractimpl, contracttype, Env, Address, Vec, Symbol};
=======
use soroban_sdk::{contractimpl, contracttype, Env, Address, Vec, Symbol, String, BytesN};
>>>>>>> 79a4553 (wip: add tests to contract)

#[contracttype]
pub struct Tier {
    pub price: i128,
    pub max_sponsors: u32,
    pub sponsor_count: u32,
}

pub struct SponsorsContract;

impl SponsorsContract {
    fn organizer_key(event_id: &String) -> (Symbol, String) {
        (Symbol::short("org"), event_id.clone())
    }

    fn tier_key(event_id: &String, tier_id: &String) -> (Symbol, String, String) {
        (Symbol::short("tier"), event_id.clone(), tier_id.clone())
    }

    fn contributions_key(event_id: &String, tier_id: &String) -> (Symbol, String, String) {
        (Symbol::short("contrib"), event_id.clone(), tier_id.clone())
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

<<<<<<< HEAD
#[cfg(test)]
mod tests {
    // Tests that exercise contract behavior should use the Soroban SDK test
    // harness; they were intentionally omitted here during merge conflict
    // resolution to avoid introducing test harness-specific code.
=======
mod test {
    #[cfg(test)]
    mod tests {
        use super::*;
        use soroban_sdk::{Env, Address, BytesN};

        fn addr(env: &Env, b: u8) -> Address {
            Address::from_contract_id(env, &BytesN::from_array(env, &[b; 32]))
        }

        #[test]
        fn register_and_contribute_flow() {
            let env = Env::default();

            let organizer = addr(&env, 1);
            env.set_invoker(organizer.clone());

            // create on-chain strings
            let event = String::from_str(&env, "event1");
            let tier = String::from_str(&env, "tierA");

            // register a tier
            SponsorsContract::register_sponsor_tier(env.clone(), event.clone(), tier.clone(), 100_i128, 2u32);

            // contribute one sponsor
            let sponsor1 = addr(&env, 2);
            SponsorsContract::contribute(env.clone(), event.clone(), tier.clone(), sponsor1.clone(), 100_i128);

            // verify contributions
            let (count, list) = SponsorsContract::get_tier_contributions(env.clone(), event.clone(), tier.clone());
            assert_eq!(count, 1);
            assert_eq!(list.len(), 1usize);

            // contribute second sponsor
            let sponsor2 = addr(&env, 3);
            SponsorsContract::contribute(env.clone(), event.clone(), tier.clone(), sponsor2.clone(), 100_i128);

            let (count2, list2) = SponsorsContract::get_tier_contributions(env.clone(), event.clone(), tier.clone());
            assert_eq!(count2, 2);
            assert_eq!(list2.len(), 2usize);
        }

        #[test]
        #[should_panic(expected = "tier is full")]
        fn contribute_beyond_capacity_panics() {
            let env = Env::default();
            let organizer = addr(&env, 10);
            env.set_invoker(organizer.clone());

            let event = String::from_str(&env, "e2");
            let tier = String::from_str(&env, "tX");

            SponsorsContract::register_sponsor_tier(env.clone(), event.clone(), tier.clone(), 50_i128, 1u32);

            let s1 = addr(&env, 11);
            SponsorsContract::contribute(env.clone(), event.clone(), tier.clone(), s1.clone(), 50_i128);

            // second contribution should panic
            let s2 = addr(&env, 12);
            SponsorsContract::contribute(env.clone(), event.clone(), tier.clone(), s2.clone(), 50_i128);
        }

        #[test]
        #[should_panic(expected = "incorrect amount")]
        fn incorrect_amount_panics() {
            let env = Env::default();
            let organizer = addr(&env, 20);
            env.set_invoker(organizer.clone());

            let event = String::from_str(&env, "e3");
            let tier = String::from_str(&env, "tY");

            SponsorsContract::register_sponsor_tier(env.clone(), event.clone(), tier.clone(), 123_i128, 2u32);

            let s = addr(&env, 21);
            // incorrect amount should panic
            SponsorsContract::contribute(env.clone(), event.clone(), tier.clone(), s.clone(), 1_i128);
        }
    }
>>>>>>> 79a4553 (wip: add tests to contract)
}

