#![allow(warnings)]
//! Tests for premium seat upgrade auctions (#1456):
//! `open_upgrade_auction`, `place_upgrade_bid`, `finalize_winning_bid`.

use crate::error::LumentixError;
use crate::lumentix_contract::{LumentixContract, LumentixContractClient};
use crate::types::EventStatus;
use crate::upgrade_auction::UpgradeAuctionStatus;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

const NOW: u64 = 100;
const EVENT_START: u64 = NOW + 1_000;

fn setup(env: &Env) -> LumentixContractClient<'_> {
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = NOW);
    let contract_id = env.register(LumentixContract, ());
    let client = LumentixContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(&admin);
    client
}

fn publish_event(env: &Env, client: &LumentixContractClient, organizer: &Address) -> u64 {
    let event_id = client.create_event(
        organizer,
        &String::from_str(env, "Auction Event"),
        &String::from_str(env, "Desc"),
        &String::from_str(env, "Venue"),
        &EVENT_START,
        &(EVENT_START + 1_000),
        &100i128,
        &50u32,
    );
    client.update_event_status(&event_id, &EventStatus::Published, organizer);
    event_id
}

fn tier(env: &Env) -> String {
    String::from_str(env, "VIP_FRONT_ROW")
}

/// An event with an open auction (min bid 50, raise by 10, 300s) and two
/// ticket holders.
fn auction_with_holders(
    env: &Env,
) -> (LumentixContractClient<'_>, Address, u64, u64, Address, u64, Address, u64) {
    let client = setup(env);
    let organizer = Address::generate(env);
    let event_id = publish_event(env, &client, &organizer);

    let alice = Address::generate(env);
    let bob = Address::generate(env);
    let alice_ticket = client.purchase_ticket(&alice, &event_id, &100i128);
    let bob_ticket = client.purchase_ticket(&bob, &event_id, &100i128);

    let auction_id =
        client.open_upgrade_auction(&organizer, &event_id, &tier(env), &50i128, &10i128, &300u64);
    (client, organizer, event_id, auction_id, alice, alice_ticket, bob, bob_ticket)
}

#[test]
fn highest_bid_wins_and_ticket_is_upgraded() {
    let env = Env::default();
    let (client, _org, _event, auction_id, alice, alice_ticket, bob, bob_ticket) =
        auction_with_holders(&env);

    client.place_upgrade_bid(&alice, &auction_id, &alice_ticket, &50i128);
    client.place_upgrade_bid(&bob, &auction_id, &bob_ticket, &80i128);
    client.place_upgrade_bid(&alice, &auction_id, &alice_ticket, &90i128);

    let bids = client.get_upgrade_bids(&auction_id);
    assert_eq!(bids.len(), 3);

    env.ledger().with_mut(|li| li.timestamp = NOW + 301);
    let auction = client.finalize_winning_bid(&auction_id);
    assert_eq!(auction.status, UpgradeAuctionStatus::Finalized);
    let winner = auction.winning_bid.unwrap();
    assert_eq!(winner.bidder, alice);
    assert_eq!(winner.amount, 90);

    assert_eq!(client.get_ticket(&alice_ticket).vip_tier, Some(tier(&env)));
    assert_eq!(client.get_ticket(&bob_ticket).vip_tier, None);
}

#[test]
fn bids_must_beat_the_leader_by_the_increment() {
    let env = Env::default();
    let (client, _org, _event, auction_id, alice, alice_ticket, bob, bob_ticket) =
        auction_with_holders(&env);

    let result = client.try_place_upgrade_bid(&alice, &auction_id, &alice_ticket, &49i128);
    assert_eq!(result, Err(Ok(LumentixError::UpgradeBidTooLow)));

    client.place_upgrade_bid(&alice, &auction_id, &alice_ticket, &50i128);

    let result = client.try_place_upgrade_bid(&bob, &auction_id, &bob_ticket, &59i128);
    assert_eq!(result, Err(Ok(LumentixError::UpgradeBidTooLow)));

    client.place_upgrade_bid(&bob, &auction_id, &bob_ticket, &60i128);
}

#[test]
fn bid_requires_an_admissible_ticket_the_bidder_owns() {
    let env = Env::default();
    let (client, organizer, _event, auction_id, alice, alice_ticket, bob, bob_ticket) =
        auction_with_holders(&env);

    let result = client.try_place_upgrade_bid(&alice, &auction_id, &bob_ticket, &50i128);
    assert_eq!(result, Err(Ok(LumentixError::UpgradeBidTicketInvalid)));

    client.use_ticket(&bob_ticket, &organizer);
    let result = client.try_place_upgrade_bid(&bob, &auction_id, &bob_ticket, &50i128);
    assert_eq!(result, Err(Ok(LumentixError::UpgradeBidTicketInvalid)));
}

#[test]
fn bidding_closes_when_the_window_ends() {
    let env = Env::default();
    let (client, _org, _event, auction_id, alice, alice_ticket, _bob, _bob_ticket) =
        auction_with_holders(&env);

    env.ledger().with_mut(|li| li.timestamp = NOW + 300);
    let result = client.try_place_upgrade_bid(&alice, &auction_id, &alice_ticket, &50i128);
    assert_eq!(result, Err(Ok(LumentixError::UpgradeAuctionClosed)));
}

#[test]
fn finalize_waits_for_the_window_and_only_runs_once() {
    let env = Env::default();
    let (client, _org, _event, auction_id, alice, alice_ticket, _bob, _bob_ticket) =
        auction_with_holders(&env);
    client.place_upgrade_bid(&alice, &auction_id, &alice_ticket, &50i128);

    let result = client.try_finalize_winning_bid(&auction_id);
    assert_eq!(result, Err(Ok(LumentixError::UpgradeAuctionStillOpen)));

    env.ledger().with_mut(|li| li.timestamp = NOW + 300);
    client.finalize_winning_bid(&auction_id);

    let result = client.try_finalize_winning_bid(&auction_id);
    assert_eq!(result, Err(Ok(LumentixError::UpgradeAuctionClosed)));
}

#[test]
fn auction_without_bids_closes_with_no_winner() {
    let env = Env::default();
    let (client, _org, _event, auction_id, _alice, alice_ticket, _bob, _bob_ticket) =
        auction_with_holders(&env);

    env.ledger().with_mut(|li| li.timestamp = NOW + 300);
    let auction = client.finalize_winning_bid(&auction_id);
    assert_eq!(auction.status, UpgradeAuctionStatus::Finalized);
    assert!(auction.winning_bid.is_none());
    assert_eq!(client.get_ticket(&alice_ticket).vip_tier, None);
}

#[test]
fn winner_who_used_their_ticket_is_not_upgraded() {
    let env = Env::default();
    let (client, organizer, _event, auction_id, alice, alice_ticket, _bob, _bob_ticket) =
        auction_with_holders(&env);
    client.place_upgrade_bid(&alice, &auction_id, &alice_ticket, &50i128);
    client.use_ticket(&alice_ticket, &organizer);

    env.ledger().with_mut(|li| li.timestamp = NOW + 300);
    let auction = client.finalize_winning_bid(&auction_id);
    assert!(auction.winning_bid.is_none());
    assert_eq!(client.get_ticket(&alice_ticket).vip_tier, None);
}

#[test]
fn only_the_organizer_opens_auctions_with_valid_terms() {
    let env = Env::default();
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let stranger = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer);

    let result = client.try_open_upgrade_auction(
        &stranger, &event_id, &tier(&env), &50i128, &10i128, &300u64,
    );
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));

    // Zero minimum bid, zero increment, too short, and ends after the event starts.
    for (min_bid, increment, duration) in [
        (0i128, 10i128, 300u64),
        (50, 0, 300),
        (50, 10, 10),
        (50, 10, 2_000),
    ] {
        let result = client.try_open_upgrade_auction(
            &organizer, &event_id, &tier(&env), &min_bid, &increment, &duration,
        );
        assert_eq!(result, Err(Ok(LumentixError::InvalidUpgradeAuction)));
    }

    let result = client.try_get_upgrade_auction(&99u64);
    assert_eq!(result, Err(Ok(LumentixError::UpgradeAuctionNotFound)));
}
