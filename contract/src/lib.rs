#![no_std]

<<<<<<< HEAD
<<<<<<< HEAD
extern crate alloc;
use alloc::string::String;
use alloc::string::ToString;
use soroban_sdk::{contractimpl, contracttype, Env, Address, Vec, Symbol};
=======
use soroban_sdk::{contractimpl, contracttype, Env, Address, Vec, Symbol, String, BytesN};
>>>>>>> 79a4553 (wip: add tests to contract)
=======
use soroban_sdk::{contracttype, Env, Address, Vec, Symbol, String, symbol_short};
>>>>>>> 2a1a6e6 (feat(contract): implement on-chain sponsor tier management with Soroban)

#[contracttype]
#[derive(Clone)]
pub struct Tier {
    pub price: i128,
    pub max_sponsors: u32,
    pub sponsor_count: u32,
}

pub fn register_sponsor_tier(
    env: &Env,
    event_id: String,
    tier_id: String,
    price: i128,
    max_sponsors: u32,
) {
    let key = (symbol_short!("tier"), event_id.clone(), tier_id.clone());
    let tier = Tier {
        price,
        max_sponsors,
        sponsor_count: 0,
    };
    env.storage().persistent().set(&key, &tier);
}

<<<<<<< HEAD
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
=======
pub fn contribute(env: &Env, event_id: String, tier_id: String, sponsor: Address, amount: i128) {
    let key = (symbol_short!("tier"), event_id.clone(), tier_id.clone());
    
    let mut tier = if let Some(t) = env.storage().persistent().get::<(Symbol, String, String), Tier>(&key) {
        t
    } else {
        panic!("tier not found");
    };

    if tier.sponsor_count >= tier.max_sponsors {
        panic!("tier is full");
    }

    if amount != tier.price {
        panic!("incorrect amount");
>>>>>>> 2a1a6e6 (feat(contract): implement on-chain sponsor tier management with Soroban)
    }

    let ckey = (symbol_short!("contrib"), event_id.clone(), tier_id.clone());
    let mut list: Vec<Address> = if let Some(list) = env.storage().persistent().get::<(Symbol, String, String), Vec<Address>>(&ckey) {
        list
    } else {
        Vec::new(env)
    };

    list.push_back(sponsor.clone());
    env.storage().persistent().set(&ckey, &list);

    tier.sponsor_count = tier.sponsor_count.saturating_add(1);
    env.storage().persistent().set(&key, &tier);
}

<<<<<<< HEAD
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
=======
pub fn get_tier_contributions(env: &Env, event_id: String, tier_id: String) -> (u32, Vec<Address>) {
    let key = (symbol_short!("contrib"), event_id.clone(), tier_id.clone());
    let list: Vec<Address> = if let Some(list) = env.storage().persistent().get::<(Symbol, String, String), Vec<Address>>(&key) {
        list
    } else {
        Vec::new(env)
    };
>>>>>>> 2a1a6e6 (feat(contract): implement on-chain sponsor tier management with Soroban)

    let count = list.len();
    (count, list)
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    #[test]
    fn test_simple_register() {
        let env = Env::default();
        env.mock_all_auths();

        let event = String::from_str(&env, "event1");
        let tier = String::from_str(&env, "tierA");

        register_sponsor_tier(&env, event, tier, 100_i128, 2u32);
    }

    #[test]
    fn register_and_contribute_flow() {
        let env = Env::default();
        env.mock_all_auths();

        let event = String::from_str(&env, "event1");
        let tier = String::from_str(&env, "tierA");

        register_sponsor_tier(&env, event.clone(), tier.clone(), 100_i128, 2u32);

        let sponsor1 = Address::generate(&env);
        contribute(&env, event.clone(), tier.clone(), sponsor1, 100_i128);

        let (count, list) = get_tier_contributions(&env, event.clone(), tier.clone());
        assert_eq!(count, 1u32);
        assert_eq!(list.len(), 1u32);

        let sponsor2 = Address::generate(&env);
        contribute(&env, event.clone(), tier.clone(), sponsor2, 100_i128);

        let (count2, list2) = get_tier_contributions(&env, event.clone(), tier.clone());
        assert_eq!(count2, 2u32);
        assert_eq!(list2.len(), 2u32);
    }

    #[test]
    #[should_panic(expected = "tier is full")]
    fn contribute_beyond_capacity_panics() {
        let env = Env::default();
        env.mock_all_auths();

        let event = String::from_str(&env, "e2");
        let tier = String::from_str(&env, "tX");

        register_sponsor_tier(&env, event.clone(), tier.clone(), 50_i128, 1u32);

        let s1 = Address::generate(&env);
        contribute(&env, event.clone(), tier.clone(), s1, 50_i128);

        let s2 = Address::generate(&env);
        contribute(&env, event.clone(), tier.clone(), s2, 50_i128);
    }

    #[test]
    #[should_panic(expected = "incorrect amount")]
    fn incorrect_amount_panics() {
        let env = Env::default();
        env.mock_all_auths();

        let event = String::from_str(&env, "e3");
        let tier = String::from_str(&env, "tY");

        register_sponsor_tier(&env, event.clone(), tier.clone(), 123_i128, 2u32);

        let s = Address::generate(&env);
        contribute(&env, event.clone(), tier.clone(), s, 1_i128);
    }
>>>>>>> 79a4553 (wip: add tests to contract)
}

