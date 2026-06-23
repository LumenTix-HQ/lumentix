#![allow(warnings)]

use crate::error::LumentixError;
use crate::lumentix_contract::{LumentixContract, LumentixContractClient};
use crate::types::{EventStatus, RarityTier};
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String};

fn setup(env: &Env) -> (Address, LumentixContractClient<'_>) {
    let contract_id = env.register(LumentixContract, ());
    let client = LumentixContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(&admin);
    (admin, client)
}

fn create_and_publish_event(
    env: &Env,
    client: &LumentixContractClient,
    organizer: &Address,
) -> u64 {
    let event_id = client.create_event(
        organizer,
        &String::from_str(env, "Test Event"),
        &String::from_str(env, "A great event"),
        &String::from_str(env, "Venue"),
        &1000u64,
        &9000u64,
        &100i128,
        &100u32,
    );
    client.update_event_status(&event_id, &EventStatus::Published, organizer);
    event_id
}

// ─── Merchandise Tests ────────────────────────────────────────────────────────

#[test]
fn test_create_event_merchandise_success() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, client) = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    let merch_id = client.create_event_merchandise(
        &organizer,
        &event_id,
        &String::from_str(&env, "T-Shirt"),
        &String::from_str(&env, "Official event T-Shirt"),
        &50i128,
        &200u32,
    );

    assert_eq!(merch_id, 1u64);

    let item = client.get_merchandise(&merch_id);
    assert_eq!(item.event_id, event_id);
    assert_eq!(item.price, 50i128);
    assert_eq!(item.total_supply, 200u32);
    assert_eq!(item.remaining_supply, 200u32);
    assert!(item.active);
}

#[test]
fn test_create_merchandise_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, client) = setup(&env);
    let organizer = Address::generate(&env);
    let attacker = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    let result = client.try_create_event_merchandise(
        &attacker,
        &event_id,
        &String::from_str(&env, "Fake Merch"),
        &String::from_str(&env, "desc"),
        &10i128,
        &10u32,
    );
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
}

#[test]
fn test_create_merchandise_cancelled_event_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, client) = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);
    client.cancel_event(&organizer, &event_id);

    let result = client.try_create_event_merchandise(
        &organizer,
        &event_id,
        &String::from_str(&env, "Merch"),
        &String::from_str(&env, "desc"),
        &10i128,
        &10u32,
    );
    assert_eq!(result, Err(Ok(LumentixError::InvalidStatusTransition)));
}

#[test]
fn test_purchase_merchandise_success() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, client) = setup(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    let merch_id = client.create_event_merchandise(
        &organizer,
        &event_id,
        &String::from_str(&env, "Cap"),
        &String::from_str(&env, "Event cap"),
        &25i128,
        &50u32,
    );

    client.purchase_merchandise(&buyer, &merch_id);

    let item = client.get_merchandise(&merch_id);
    assert_eq!(item.remaining_supply, 49u32);
}

#[test]
fn test_purchase_merchandise_sold_out() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, client) = setup(&env);
    let organizer = Address::generate(&env);
    let buyer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    let merch_id = client.create_event_merchandise(
        &organizer,
        &event_id,
        &String::from_str(&env, "Poster"),
        &String::from_str(&env, "Limited poster"),
        &10i128,
        &1u32,
    );

    client.purchase_merchandise(&buyer, &merch_id);

    let result = client.try_purchase_merchandise(&buyer, &merch_id);
    assert_eq!(result, Err(Ok(LumentixError::MerchandiseSoldOut)));
}

// ─── Collectible Inventory Tests ──────────────────────────────────────────────

#[test]
fn test_manage_collectible_inventory_create() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, client) = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    client.manage_collectible_inventory(&organizer, &event_id, &100u32);

    let inv = client.get_collectible_inventory(&event_id);
    assert_eq!(inv.max_supply, 100u32);
    assert_eq!(inv.total_minted, 0u32);
}

#[test]
fn test_manage_collectible_inventory_update() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, client) = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    client.manage_collectible_inventory(&organizer, &event_id, &50u32);
    // Increase supply
    client.manage_collectible_inventory(&organizer, &event_id, &200u32);

    let inv = client.get_collectible_inventory(&event_id);
    assert_eq!(inv.max_supply, 200u32);
}

#[test]
fn test_manage_collectible_inventory_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, client) = setup(&env);
    let organizer = Address::generate(&env);
    let attacker = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    let result =
        client.try_manage_collectible_inventory(&attacker, &event_id, &100u32);
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
}

// ─── NFT Minting Tests ────────────────────────────────────────────────────────

#[test]
fn test_mint_commemorative_nft_success() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, client) = setup(&env);
    let organizer = Address::generate(&env);
    let recipient = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    client.manage_collectible_inventory(&organizer, &event_id, &100u32);

    let metadata_hash = BytesN::from_array(&env, &[1u8; 32]);

    let nft_id = client.mint_commemorative_nft(
        &organizer,
        &event_id,
        &recipient,
        &String::from_str(&env, "Gold Pass"),
        &String::from_str(&env, "Exclusive commemorative NFT"),
        &RarityTier::Rare,
        &true,
        &metadata_hash,
    );

    assert_eq!(nft_id, 1u64);

    let nft = client.get_nft(&nft_id);
    assert_eq!(nft.event_id, event_id);
    assert_eq!(nft.owner, recipient);
    assert_eq!(nft.rarity, RarityTier::Rare);
    assert!(nft.transferable);
}

#[test]
fn test_mint_nft_without_inventory_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, client) = setup(&env);
    let organizer = Address::generate(&env);
    let recipient = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    let metadata_hash = BytesN::from_array(&env, &[2u8; 32]);

    let result = client.try_mint_commemorative_nft(
        &organizer,
        &event_id,
        &recipient,
        &String::from_str(&env, "NFT"),
        &String::from_str(&env, "desc"),
        &RarityTier::Common,
        &true,
        &metadata_hash,
    );
    assert_eq!(result, Err(Ok(LumentixError::CollectibleInventoryNotFound)));
}

#[test]
fn test_mint_nft_max_supply_reached() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, client) = setup(&env);
    let organizer = Address::generate(&env);
    let recipient = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    // Set max supply to 1
    client.manage_collectible_inventory(&organizer, &event_id, &1u32);

    let metadata_hash = BytesN::from_array(&env, &[3u8; 32]);

    client.mint_commemorative_nft(
        &organizer,
        &event_id,
        &recipient,
        &String::from_str(&env, "NFT 1"),
        &String::from_str(&env, "desc"),
        &RarityTier::Common,
        &true,
        &metadata_hash,
    );

    let result = client.try_mint_commemorative_nft(
        &organizer,
        &event_id,
        &recipient,
        &String::from_str(&env, "NFT 2"),
        &String::from_str(&env, "desc"),
        &RarityTier::Common,
        &true,
        &metadata_hash,
    );
    assert_eq!(result, Err(Ok(LumentixError::CollectibleMaxSupplyReached)));
}

#[test]
fn test_mint_legendary_rarity_cap() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, client) = setup(&env);
    let organizer = Address::generate(&env);
    let recipient = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    // max_supply = 100, legendary cap = max(100/100, 1) = 1
    client.manage_collectible_inventory(&organizer, &event_id, &100u32);

    let metadata_hash = BytesN::from_array(&env, &[4u8; 32]);

    // First legendary should succeed
    client.mint_commemorative_nft(
        &organizer,
        &event_id,
        &recipient,
        &String::from_str(&env, "Legendary 1"),
        &String::from_str(&env, "desc"),
        &RarityTier::Legendary,
        &false,
        &metadata_hash,
    );

    // Second legendary should fail (cap = 1)
    let result = client.try_mint_commemorative_nft(
        &organizer,
        &event_id,
        &recipient,
        &String::from_str(&env, "Legendary 2"),
        &String::from_str(&env, "desc"),
        &RarityTier::Legendary,
        &false,
        &metadata_hash,
    );
    assert_eq!(result, Err(Ok(LumentixError::RarityTierExhausted)));
}

// ─── NFT Trading Tests ────────────────────────────────────────────────────────

#[test]
fn test_trade_nft_success() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, client) = setup(&env);
    let organizer = Address::generate(&env);
    let owner = Address::generate(&env);
    let buyer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    client.manage_collectible_inventory(&organizer, &event_id, &50u32);

    let metadata_hash = BytesN::from_array(&env, &[5u8; 32]);

    let nft_id = client.mint_commemorative_nft(
        &organizer,
        &event_id,
        &owner,
        &String::from_str(&env, "Tradeable NFT"),
        &String::from_str(&env, "desc"),
        &RarityTier::Uncommon,
        &true,
        &metadata_hash,
    );

    client.trade_nft(&owner, &buyer, &nft_id);

    let nft = client.get_nft(&nft_id);
    assert_eq!(nft.owner, buyer);
}

#[test]
fn test_trade_nft_not_transferable() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, client) = setup(&env);
    let organizer = Address::generate(&env);
    let owner = Address::generate(&env);
    let buyer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    client.manage_collectible_inventory(&organizer, &event_id, &50u32);

    let metadata_hash = BytesN::from_array(&env, &[6u8; 32]);

    let nft_id = client.mint_commemorative_nft(
        &organizer,
        &event_id,
        &owner,
        &String::from_str(&env, "Soulbound NFT"),
        &String::from_str(&env, "desc"),
        &RarityTier::Epic,
        &false, // not transferable
        &metadata_hash,
    );

    let result = client.try_trade_nft(&owner, &buyer, &nft_id);
    assert_eq!(result, Err(Ok(LumentixError::NftNotTransferable)));
}

#[test]
fn test_trade_nft_not_owner() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, client) = setup(&env);
    let organizer = Address::generate(&env);
    let owner = Address::generate(&env);
    let attacker = Address::generate(&env);
    let buyer = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    client.manage_collectible_inventory(&organizer, &event_id, &50u32);

    let metadata_hash = BytesN::from_array(&env, &[7u8; 32]);

    let nft_id = client.mint_commemorative_nft(
        &organizer,
        &event_id,
        &owner,
        &String::from_str(&env, "NFT"),
        &String::from_str(&env, "desc"),
        &RarityTier::Common,
        &true,
        &metadata_hash,
    );

    let result = client.try_trade_nft(&attacker, &buyer, &nft_id);
    assert_eq!(result, Err(Ok(LumentixError::NftNotOwned)));
}

#[test]
fn test_collectible_inventory_tracks_rarity_counts() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, client) = setup(&env);
    let organizer = Address::generate(&env);
    let recipient = Address::generate(&env);
    let event_id = create_and_publish_event(&env, &client, &organizer);

    client.manage_collectible_inventory(&organizer, &event_id, &200u32);

    let metadata_hash = BytesN::from_array(&env, &[8u8; 32]);

    client.mint_commemorative_nft(
        &organizer,
        &event_id,
        &recipient,
        &String::from_str(&env, "Common 1"),
        &String::from_str(&env, "desc"),
        &RarityTier::Common,
        &true,
        &metadata_hash,
    );

    client.mint_commemorative_nft(
        &organizer,
        &event_id,
        &recipient,
        &String::from_str(&env, "Rare 1"),
        &String::from_str(&env, "desc"),
        &RarityTier::Rare,
        &true,
        &metadata_hash,
    );

    let inv = client.get_collectible_inventory(&event_id);
    assert_eq!(inv.total_minted, 2u32);
    assert_eq!(inv.common_minted, 1u32);
    assert_eq!(inv.rare_minted, 1u32);
    assert_eq!(inv.uncommon_minted, 0u32);
    assert_eq!(inv.epic_minted, 0u32);
    assert_eq!(inv.legendary_minted, 0u32);
}
