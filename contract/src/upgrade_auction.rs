//! Real-time bidding for premium seat upgrades (Issue #1456).
//!
//! Close to the event date an organizer can offer a premium tier (for example
//! `VIP_FRONT_ROW`) to the ticket holders who want it most. [`open_upgrade_auction`]
//! starts an open, ascending auction for one upgrade; ticket holders
//! [`place_upgrade_bid`] with a ticket they own, and once the window has passed
//! anyone can [`finalize_winning_bid`] to move the highest bidder's ticket into
//! the tier.
//!
//! The mechanism is transparent by construction: every bid is stored in a
//! public list and emitted as an event, the rules (minimum bid, minimum raise,
//! end time) are fixed when the auction opens, and the highest bid always wins.
//! A bid is held by the contract while it leads and is refunded the moment it
//! is outbid, so no one is ever charged for a bid that did not win. The winning
//! payment is credited to the event's escrow like a ticket sale, net of the
//! platform fee.

use crate::error::LumentixError;
use crate::events::{UpgradeAuctionFinalized, UpgradeAuctionOpened, UpgradeBidPlaced};
use crate::storage;
use crate::types::{EventStatus, PERSISTENT_LIFETIME};
use soroban_sdk::{Address, Env, String, Symbol, Vec};

/// Shortest bidding window an auction may run for, in seconds.
pub const MIN_AUCTION_DURATION: u64 = 60;
/// Longest bidding window an auction may run for, in seconds (seven days).
pub const MAX_AUCTION_DURATION: u64 = 604_800;
/// Most bids one auction records; keeps the public bid list within ledger limits.
pub const MAX_BIDS_PER_AUCTION: u32 = 100;
/// Longest accepted tier name, in bytes.
pub const MAX_TIER_LEN: u32 = 32;

/// Where an auction is in its life.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub enum UpgradeAuctionStatus {
    /// Accepting bids until `ends_at`.
    Open,
    /// Closed and settled; no further bids or finalization.
    Finalized,
}

/// One bid on an upgrade auction.
#[derive(Clone, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub struct UpgradeBid {
    pub bidder: Address,
    /// The ticket that moves into the auctioned tier if this bid wins.
    pub ticket_id: u64,
    pub amount: i128,
    pub placed_at: u64,
}

/// An ascending auction for one premium upgrade at one event.
#[derive(Clone, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub struct UpgradeAuction {
    pub auction_id: u64,
    pub event_id: u64,
    /// The tier the winning ticket is moved into.
    pub target_tier: String,
    /// Lowest acceptable opening bid.
    pub min_bid: i128,
    /// How much each bid must beat the current highest by.
    pub min_increment: i128,
    pub opened_at: u64,
    pub ends_at: u64,
    pub status: UpgradeAuctionStatus,
    /// The bid currently in the lead, if any.
    pub highest_bid: Option<UpgradeBid>,
    /// Total bids placed.
    pub bid_count: u32,
    /// The bid that won, set when the auction is finalized with a winner.
    pub winning_bid: Option<UpgradeBid>,
}

// ──────────────────────────── Storage ───────────────────────────────────────

/// key: Symbol("upg_auc_next") in instance storage
fn counter_key(env: &Env) -> Symbol {
    Symbol::new(env, "upg_auc_next")
}

/// key: (Symbol("upg_auction"), auction_id: u64)
fn auction_key(env: &Env, auction_id: u64) -> (Symbol, u64) {
    (Symbol::new(env, "upg_auction"), auction_id)
}

/// key: (Symbol("upg_bids"), auction_id: u64)
fn bids_key(env: &Env, auction_id: u64) -> (Symbol, u64) {
    (Symbol::new(env, "upg_bids"), auction_id)
}

fn next_auction_id(env: &Env) -> u64 {
    let id: u64 = env.storage().instance().get(&counter_key(env)).unwrap_or(1);
    env.storage().instance().set(&counter_key(env), &(id + 1));
    id
}

fn store_auction(env: &Env, auction: &UpgradeAuction) {
    let key = auction_key(env, auction.auction_id);
    env.storage().persistent().set(&key, auction);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

fn store_bids(env: &Env, auction_id: u64, bids: &Vec<UpgradeBid>) {
    let key = bids_key(env, auction_id);
    env.storage().persistent().set(&key, bids);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

/// Read an auction.
pub fn get_upgrade_auction(env: &Env, auction_id: u64) -> Result<UpgradeAuction, LumentixError> {
    let key = auction_key(env, auction_id);
    let auction = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(LumentixError::UpgradeAuctionNotFound)?;
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
    Ok(auction)
}

/// Every bid placed on an auction, oldest first.
pub fn get_upgrade_bids(env: &Env, auction_id: u64) -> Result<Vec<UpgradeBid>, LumentixError> {
    get_upgrade_auction(env, auction_id)?;
    Ok(env
        .storage()
        .persistent()
        .get(&bids_key(env, auction_id))
        .unwrap_or_else(|| Vec::new(env)))
}

// ──────────────────────────── Token movement ────────────────────────────────

/// Pull a bid into the contract. A no-op when no payment token is configured,
/// matching how ticket purchases behave.
fn collect_bid(env: &Env, from: &Address, amount: i128) {
    if let Ok(token) = storage::get_token_result(env) {
        soroban_sdk::token::Client::new(env, &token).transfer(
            from,
            &env.current_contract_address(),
            &amount,
        );
    }
}

/// Return a held bid to its bidder.
fn refund_bid(env: &Env, to: &Address, amount: i128) {
    if let Ok(token) = storage::get_token_result(env) {
        soroban_sdk::token::Client::new(env, &token).transfer(
            &env.current_contract_address(),
            to,
            &amount,
        );
    }
}

// ──────────────────────────── Public interface ──────────────────────────────

/// Open an upgrade auction for `event_id` that runs for `duration_seconds`.
///
/// The event must be published and the auction must end before the event
/// starts, so upgrades are settled before doors open. Authorization is the
/// caller's job.
///
/// Fails with `InvalidUpgradeAuction` for an empty or oversized tier, a
/// non-positive minimum bid or increment, a duration outside
/// [`MIN_AUCTION_DURATION`]..=[`MAX_AUCTION_DURATION`], or an end time past the
/// event's start.
pub fn open_upgrade_auction(
    env: &Env,
    event_id: u64,
    target_tier: String,
    min_bid: i128,
    min_increment: i128,
    duration_seconds: u64,
) -> Result<UpgradeAuction, LumentixError> {
    if target_tier.len() == 0
        || target_tier.len() > MAX_TIER_LEN
        || min_bid <= 0
        || min_increment <= 0
        || duration_seconds < MIN_AUCTION_DURATION
        || duration_seconds > MAX_AUCTION_DURATION
    {
        return Err(LumentixError::InvalidUpgradeAuction);
    }

    let event = storage::get_event(env, event_id)?;
    if event.status != EventStatus::Published {
        return Err(LumentixError::InvalidStatusTransition);
    }

    let now = env.ledger().timestamp();
    let ends_at = now
        .checked_add(duration_seconds)
        .ok_or(LumentixError::InvalidUpgradeAuction)?;
    if ends_at > event.start_time {
        return Err(LumentixError::InvalidUpgradeAuction);
    }

    let auction = UpgradeAuction {
        auction_id: next_auction_id(env),
        event_id,
        target_tier: target_tier.clone(),
        min_bid,
        min_increment,
        opened_at: now,
        ends_at,
        status: UpgradeAuctionStatus::Open,
        highest_bid: None,
        bid_count: 0,
        winning_bid: None,
    };
    store_auction(env, &auction);

    UpgradeAuctionOpened::emit(env, auction.auction_id, event_id, target_tier, ends_at);
    Ok(auction)
}

/// Bid `amount` on an auction with a ticket the bidder owns.
///
/// The bid must meet the minimum bid, and beat the current highest bid by the
/// minimum increment. The previous leader is refunded immediately. Returns the
/// updated auction.
///
/// Fails with `UpgradeAuctionClosed` once the window has ended,
/// `UpgradeBidTicketInvalid` when the ticket is not the bidder's, belongs to
/// another event or is used, revoked or refunded, `UpgradeTierAlreadyHeld`
/// when the ticket is already in the tier, `UpgradeBidTooLow`, and
/// `UpgradeAuctionBidLimit` once [`MAX_BIDS_PER_AUCTION`] bids are recorded.
pub fn place_upgrade_bid(
    env: &Env,
    bidder: &Address,
    auction_id: u64,
    ticket_id: u64,
    amount: i128,
) -> Result<UpgradeAuction, LumentixError> {
    let mut auction = get_upgrade_auction(env, auction_id)?;
    let now = env.ledger().timestamp();
    if auction.status != UpgradeAuctionStatus::Open || now >= auction.ends_at {
        return Err(LumentixError::UpgradeAuctionClosed);
    }

    let ticket = storage::get_ticket(env, ticket_id)?;
    if ticket.owner != *bidder
        || ticket.event_id != auction.event_id
        || ticket.used
        || ticket.revoked
        || ticket.refunded
    {
        return Err(LumentixError::UpgradeBidTicketInvalid);
    }
    if ticket.vip_tier == Some(auction.target_tier.clone()) {
        return Err(LumentixError::UpgradeTierAlreadyHeld);
    }

    let required = match &auction.highest_bid {
        Some(highest) => highest
            .amount
            .checked_add(auction.min_increment)
            .ok_or(LumentixError::UpgradeBidTooLow)?,
        None => auction.min_bid,
    };
    if amount < required {
        return Err(LumentixError::UpgradeBidTooLow);
    }
    if auction.bid_count >= MAX_BIDS_PER_AUCTION {
        return Err(LumentixError::UpgradeAuctionBidLimit);
    }

    let bid = UpgradeBid {
        bidder: bidder.clone(),
        ticket_id,
        amount,
        placed_at: now,
    };

    let mut bids = get_upgrade_bids(env, auction_id)?;
    bids.push_back(bid.clone());
    store_bids(env, auction_id, &bids);

    let previous = auction.highest_bid.replace(bid);
    auction.bid_count += 1;
    store_auction(env, &auction);

    collect_bid(env, bidder, amount);
    if let Some(outbid) = previous {
        refund_bid(env, &outbid.bidder, outbid.amount);
    }

    UpgradeBidPlaced::emit(env, auction_id, bidder.clone(), ticket_id, amount);
    Ok(auction)
}

/// Close an auction whose window has ended and settle it.
///
/// The highest bid wins: its ticket moves into the target tier and its
/// payment is credited to the event escrow, net of the platform fee. If the
/// winning ticket can no longer be upgraded (it was transferred, used or
/// refunded, or the event is no longer on sale) the bid is refunded and the
/// auction closes with no winner. An auction with no bids closes empty.
/// Anyone may finalize, since the outcome is fixed by the bids.
///
/// Fails with `UpgradeAuctionStillOpen` before the window ends and
/// `UpgradeAuctionClosed` when it was already finalized.
pub fn finalize_winning_bid(env: &Env, auction_id: u64) -> Result<UpgradeAuction, LumentixError> {
    let mut auction = get_upgrade_auction(env, auction_id)?;
    if auction.status == UpgradeAuctionStatus::Finalized {
        return Err(LumentixError::UpgradeAuctionClosed);
    }
    if env.ledger().timestamp() < auction.ends_at {
        return Err(LumentixError::UpgradeAuctionStillOpen);
    }

    auction.status = UpgradeAuctionStatus::Finalized;

    if let Some(bid) = auction.highest_bid.clone() {
        if settle_winner(env, &auction, &bid) {
            auction.winning_bid = Some(bid);
        } else {
            refund_bid(env, &bid.bidder, bid.amount);
        }
    }
    store_auction(env, &auction);

    match &auction.winning_bid {
        Some(win) => {
            UpgradeAuctionFinalized::emit(env, auction_id, Some(win.bidder.clone()), win.amount)
        }
        None => UpgradeAuctionFinalized::emit(env, auction_id, None, 0),
    }
    Ok(auction)
}

/// Upgrade the winning ticket and credit the payment. Returns false, leaving
/// everything untouched, when the ticket or event is no longer eligible.
fn settle_winner(env: &Env, auction: &UpgradeAuction, bid: &UpgradeBid) -> bool {
    match storage::get_event(env, auction.event_id) {
        Ok(event) if event.status == EventStatus::Published => {}
        _ => return false,
    }

    let mut ticket = match storage::get_ticket(env, bid.ticket_id) {
        Ok(ticket) => ticket,
        Err(_) => return false,
    };
    if ticket.owner != bid.bidder || ticket.used || ticket.revoked || ticket.refunded {
        return false;
    }

    ticket.vip_tier = Some(auction.target_tier.clone());
    storage::set_ticket(env, bid.ticket_id, &ticket);

    let fee_bps = storage::get_platform_fee_bps(env);
    let platform_fee = (bid.amount * fee_bps as i128) / 10_000;
    if platform_fee > 0 {
        storage::add_platform_balance(env, platform_fee);
    }
    storage::add_escrow(env, auction.event_id, bid.amount - platform_fee);
    true
}
