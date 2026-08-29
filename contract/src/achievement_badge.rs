//! Achievement badge NFTs for gamification milestones.
//!
//! Soulbound badges are minted to attendee wallets when milestone
//! criteria are met. They are non-transferable (soulbound) and can be
//! revoked by the admin after they expire.

use soroban_sdk::{Address, Env, String, Symbol, Vec};

// ──────────────────────────── Types ─────────────────────────────────────────

/// A soulbound achievement badge record.
#[derive(Clone)]
#[soroban_sdk::contracttype]
pub struct AchievementBadge {
    /// Unique badge identifier.
    pub badge_id: u64,
    /// Wallet that earned the badge.
    pub owner: Address,
    /// Human-readable milestone name (e.g. "Attended 10 Events").
    pub milestone: String,
    /// Ledger timestamp when the badge was minted.
    pub minted_at: u64,
    /// Ledger timestamp when the badge expires (0 = no expiry).
    pub expires_at: u64,
    /// Whether the badge has been revoked.
    pub revoked: bool,
}

// ──────────────────────────── Milestone criteria ─────────────────────────────

/// Well-known milestone thresholds.
pub const MILESTONE_EVENTS_ATTENDED: u32 = 10;
pub const MILESTONE_LOYALTY_POINTS: u32 = 1_000;

// ──────────────────────────── Storage keys ──────────────────────────────────

/// Counter for the next badge ID.
fn badge_counter_key(env: &Env) -> Symbol {
    Symbol::new(env, "badge_counter")
}

/// Key for a specific badge.
fn badge_key(env: &Env, badge_id: u64) -> (Symbol, u64) {
    (Symbol::new(env, "badge"), badge_id)
}

/// Key for the set of badge IDs owned by an address.
fn owner_badges_key(env: &Env, owner: &Address) -> (Symbol, Address) {
    (Symbol::new(env, "owner_badges"), owner.clone())
}

// ──────────────────────────── Public interface ───────────────────────────────

/// Check whether an owner is eligible for a milestone badge.
///
/// `events_attended` and `loyalty_points` represent the current stats for the
/// owner. Returns `true` if any milestone threshold is met and the owner does
/// not already hold a non-revoked badge.
pub fn check_milestone_eligibility(
    env: &Env,
    owner: &Address,
    events_attended: u32,
    loyalty_points: u32,
) -> bool {
    let is_eligible =
        events_attended >= MILESTONE_EVENTS_ATTENDED
            || loyalty_points >= MILESTONE_LOYALTY_POINTS;

    if !is_eligible {
        return false;
    }

    // Verify the owner does not already hold an active badge.
    let owned: Vec<u64> = env
        .storage()
        .persistent()
        .get(&owner_badges_key(env, owner))
        .unwrap_or_else(|| Vec::new(env));

    for badge_id in owned.iter() {
        if let Some(badge) = env
            .storage()
            .persistent()
            .get::<(Symbol, u64), AchievementBadge>(&badge_key(env, badge_id))
        {
            if !badge.revoked {
                return false; // already has an active badge
            }
        }
    }

    true
}

/// Mint a soulbound achievement badge to `owner`.
///
/// `expires_at` is a ledger timestamp; pass `0` for a non-expiring badge.
/// Panics if the owner is not eligible.
pub fn mint_achievement_badge(
    env: &Env,
    owner: Address,
    milestone: String,
    events_attended: u32,
    loyalty_points: u32,
    expires_at: u64,
) -> AchievementBadge {
    if !check_milestone_eligibility(env, &owner, events_attended, loyalty_points) {
        panic!("Owner is not eligible for a milestone badge");
    }

    let badge_id: u64 = env
        .storage()
        .persistent()
        .get(&badge_counter_key(env))
        .unwrap_or(0u64)
        + 1;

    env.storage()
        .persistent()
        .set(&badge_counter_key(env), &badge_id);

    let badge = AchievementBadge {
        badge_id,
        owner: owner.clone(),
        milestone: milestone.clone(),
        minted_at: env.ledger().timestamp(),
        expires_at,
        revoked: false,
    };

    env.storage()
        .persistent()
        .set(&badge_key(env, badge_id), &badge);

    // Append to owner's badge list.
    let mut owned: Vec<u64> = env
        .storage()
        .persistent()
        .get(&owner_badges_key(env, &owner))
        .unwrap_or_else(|| Vec::new(env));
    owned.push_back(badge_id);
    env.storage()
        .persistent()
        .set(&owner_badges_key(env, &owner), &owned);

    env.events().publish(
        (Symbol::new(env, "badge_minted"), badge_id),
        (owner, milestone),
    );

    badge
}

/// Revoke an expired or invalid badge by ID.
///
/// Only marks the badge as revoked in storage; does not delete the record
/// so the ledger history is preserved. Panics if the badge does not exist.
pub fn revoke_expired_badge(env: &Env, badge_id: u64) -> AchievementBadge {
    let key = badge_key(env, badge_id);
    let mut badge: AchievementBadge = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| panic!("Badge {badge_id} does not exist"));

    if badge.revoked {
        panic!("Badge {badge_id} is already revoked");
    }

    badge.revoked = true;
    env.storage().persistent().set(&key, &badge);

    env.events().publish(
        (Symbol::new(env, "badge_revoked"), badge_id),
        badge.owner.clone(),
    );

    badge
}
