#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, String, Symbol, Vec,
};

#[contracttype]
#[derive(Clone)]
pub struct Tier {
    pub price: i128,
    pub max_sponsors: u32,
    pub sponsor_count: u32,
}

// Register a sponsor tier for an event.
#[contract]
pub struct SponsorsContract;

#[contractimpl]
impl SponsorsContract {
    pub fn register_sponsor_tier(
        env: Env,
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

    pub fn contribute(env: Env, event_id: String, tier_id: String, sponsor: Address, amount: i128) {
        let key = (symbol_short!("tier"), event_id.clone(), tier_id.clone());
        let mut tier: Tier = env
            .storage()
            .persistent()
            .get::<(Symbol, String, String), Tier>(&key)
            .expect("tier not found");

        if tier.sponsor_count >= tier.max_sponsors {
            panic!("tier is full");
        }

        if amount != tier.price {
            panic!("incorrect amount");
        }

        let ckey = (symbol_short!("contrib"), event_id.clone(), tier_id.clone());
        let mut list: Vec<Address> = env
            .storage()
            .persistent()
            .get::<(Symbol, String, String), Vec<Address>>(&ckey)
            .unwrap_or_else(|| Vec::new(&env));

        list.push_back(sponsor.clone());
        env.storage().persistent().set(&ckey, &list);

        tier.sponsor_count = tier.sponsor_count.saturating_add(1);
        env.storage().persistent().set(&key, &tier);
    }

    pub fn get_tier_contributions(
        env: Env,
        event_id: String,
        tier_id: String,
    ) -> (u32, Vec<Address>) {
        let key = (symbol_short!("contrib"), event_id.clone(), tier_id.clone());
        let list: Vec<Address> = env
            .storage()
            .persistent()
            .get::<(Symbol, String, String), Vec<Address>>(&key)
            .unwrap_or_else(|| Vec::new(&env));

        let count = list.len();
        (count, list)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn test_simple_register() {
        let env = Env::default();
        env.mock_all_auths();

        let event = String::from_str(&env, "event1");
        let tier = String::from_str(&env, "tierA");

        let contract_id = env.register(SponsorsContract, ());
        let client = SponsorsContractClient::new(&env, &contract_id);

        client.register_sponsor_tier(&event, &tier, &100_i128, &2u32);
    }

    #[test]
    fn register_and_contribute_flow() {
        let env = Env::default();
        env.mock_all_auths();

        let event = String::from_str(&env, "event1");
        let tier = String::from_str(&env, "tierA");

        let contract_id = env.register(SponsorsContract, ());
        let client = SponsorsContractClient::new(&env, &contract_id);

        client.register_sponsor_tier(&event, &tier, &100_i128, &2u32);

        let sponsor1 = Address::generate(&env);
        client.contribute(&event, &tier, &sponsor1, &100_i128);

        let (count, list) = client.get_tier_contributions(&event, &tier);
        assert_eq!(count, 1u32);
        assert_eq!(list.len(), 1u32);

        let sponsor2 = Address::generate(&env);
        client.contribute(&event, &tier, &sponsor2, &100_i128);

        let (count2, list2) = client.get_tier_contributions(&event, &tier);
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

        let contract_id = env.register(SponsorsContract, ());
        let client = SponsorsContractClient::new(&env, &contract_id);

        client.register_sponsor_tier(&event, &tier, &50_i128, &1u32);

        let s1 = Address::generate(&env);
        client.contribute(&event, &tier, &s1, &50_i128);

        let s2 = Address::generate(&env);
        client.contribute(&event, &tier, &s2, &50_i128);
    }

    #[test]
    #[should_panic(expected = "incorrect amount")]
    fn incorrect_amount_panics() {
        let env = Env::default();
        env.mock_all_auths();

        let event = String::from_str(&env, "e3");
        let tier = String::from_str(&env, "tY");

        let contract_id = env.register(SponsorsContract, ());
        let client = SponsorsContractClient::new(&env, &contract_id);

        client.register_sponsor_tier(&event, &tier, &123_i128, &2u32);

        let s = Address::generate(&env);
        client.contribute(&event, &tier, &s, &1_i128);
    }
}
