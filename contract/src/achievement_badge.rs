//! Achievement badge NFTs for gamification milestones.
//!
//! Soulbound badges are minted to attendee wallets when milestone
//! criteria are met. They are non-transferable (soulbound) and can be
//! revoked by the contract admin after they expire.

use crate::error::LumentixError;
use crate::events::AchievementBadgeMinted;
use crate::events::AchievementBadgeRevoked;
use soroban_sdk::{Address, Env, String, Symbol, Vec};

// ──────────────────────────── Types ─────────────────────────────────────────

/// A soulbound achievement badge record.
#[derive(Clone, Debug, Eq, PartialEq)]
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
/// Returns `BadgeNotEligible` if the owner has not reached a milestone or
/// already holds an active badge.
pub fn mint_achievement_badge(
    env: &Env,
    owner: Address,
    milestone: String,
    events_attended: u32,
    loyalty_points: u32,
    expires_at: u64,
) -> Result<AchievementBadge, LumentixError> {
    if !check_milestone_eligibility(env, &owner, events_attended, loyalty_points) {
        return Err(LumentixError::BadgeNotEligible);
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

    AchievementBadgeMinted::emit(env, badge_id, owner.clone(), milestone);

    Ok(badge)
}

/// Revoke an expired or invalid badge by ID.
///
/// Only marks the badge as revoked in storage; does not delete the record
/// so the ledger history is preserved. Returns `BadgeNotFound` if the badge
/// does not exist and `BadgeAlreadyRevoked` on a repeated revoke.
pub fn revoke_expired_badge(
    env: &Env,
    badge_id: u64,
) -> Result<AchievementBadge, LumentixError> {
    let key = badge_key(env, badge_id);
    let mut badge: AchievementBadge = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(LumentixError::BadgeNotFound)?;

    if badge.revoked {
        return Err(LumentixError::BadgeAlreadyRevoked);
    }

    badge.revoked = true;
    env.storage().persistent().set(&key, &badge);

    AchievementBadgeRevoked::emit(env, badge_id, badge.owner.clone());

    Ok(badge)
}

/// Return a single badge by ID, or `BadgeNotFound`.
pub fn get_badge(env: &Env, badge_id: u64) -> Result<AchievementBadge, LumentixError> {
    env.storage()
        .persistent()
        .get(&badge_key(env, badge_id))
        .ok_or(LumentixError::BadgeNotFound)
}

/// Return all badges currently held by `owner`.
pub fn get_owner_badges(env: &Env, owner: &Address) -> Vec<AchievementBadge> {
    let owned: Vec<u64> = env
        .storage()
        .persistent()
        .get(&owner_badges_key(env, owner))
        .unwrap_or_else(|| Vec::new(env));

    let mut badges: Vec<AchievementBadge> = Vec::new(env);
    for badge_id in owned.iter() {
        if let Some(badge) = env
            .storage()
            .persistent()
            .get::<(Symbol, u64), AchievementBadge>(&badge_key(env, badge_id))
        {
            badges.push_back(badge);
        }
    }
    badges
}
#[cfg(test)]
mod test {
    use super::*;
    use crate::error::LumentixError;
    use crate::lumentix_contract::{LumentixContract, LumentixContractClient};
    use soroban_sdk::{testutils::Address as _, Env};

    fn setup(env: &Env) -> (Address, LumentixContractClient<'_>) {
        env.mock_all_auths();
        let contract_id = env.register(LumentixContract, ());
        let client = LumentixContractClient::new(env, &contract_id);
        let admin = Address::generate(env);
        client.initialize(&admin);
        (admin, client)
    }

    fn milestone(env: &Env, text: &str) -> String {
        String::from_str(env, text)
    }

    #[test]
    fn mints_badge_when_events_threshold_met() {
        let env = Env::default();
        let (_admin, client) = setup(&env);
        let owner = Address::generate(&env);

        let badge = client.mint_achievement_badge(
            &owner,
            &milestone(&env, "Attended 10 Events"),
            &10u32,
            &0u32,
            &0u64,
        );

        assert_eq!(badge.badge_id, 1);
        assert_eq!(badge.owner, owner);
        assert!(!badge.revoked);

        let fetched = client.get_badge(&1);
        assert_eq!(fetched.unwrap().owner, owner);
        assert_eq!(client.get_owner_badges(&owner).len(), 1);
    }

    #[test]
    fn mints_badge_when_loyalty_threshold_met() {
        let env = Env::default();
        let (_admin, client) = setup(&env);
        let owner = Address::generate(&env);

        let badge = client.mint_achievement_badge(
            &owner,
            &milestone(&env, "Loyalty Legend"),
            &3u32,
            &1000u32,
            &0u64,
        );

        assert_eq!(badge.badge_id, 1);
    }

    #[test]
    fn rejects_mint_below_all_thresholds() {
        let env = Env::default();
        let (_admin, client) = setup(&env);
        let owner = Address::generate(&env);

        let result = client.try_mint_achievement_badge(
            &owner,
            &milestone(&env, "Nope"),
            &5u32,
            &100u32,
            &0u64,
        );

        assert_eq!(result, Err(Ok(LumentixError::BadgeNotEligible)));
    }

    #[test]
    fn rejects_second_active_badge() {
        let env = Env::default();
        let (_admin, client) = setup(&env);
        let owner = Address::generate(&env);

        client.mint_achievement_badge(
            &owner,
            &milestone(&env, "First"),
            &10u32,
            &0u32,
            &0u64,
        );

        let result = client.try_mint_achievement_badge(
            &owner,
            &milestone(&env, "Second"),
            &10u32,
            &0u32,
            &0u64,
        );
        assert_eq!(result, Err(Ok(LumentixError::BadgeNotEligible)));
    }

    #[test]
    fn revokes_badge_as_admin() {
        let env = Env::default();
        let (admin, client) = setup(&env);
        let owner = Address::generate(&env);

        client.mint_achievement_badge(&owner, &milestone(&env, "Shiny"), &10u32, &0u32, &0u64);

        let revoked = client.revoke_expired_badge(&admin, &1);
        assert!(revoked.unwrap().revoked);

        // A repeated revoke is rejected.
        let again = client.try_revoke_expired_badge(&admin, &1);
        assert_eq!(again, Err(Ok(LumentixError::BadgeAlreadyRevoked)));
    }

    #[test]
    fn rejects_revoke_by_non_admin() {
        let env = Env::default();
        let (_admin, client) = setup(&env);
        let owner = Address::generate(&env);
        let intruder = Address::generate(&env);

        client.mint_achievement_badge(&owner, &milestone(&env, "Shiny"), &10u32, &0u32, &0u64);

        let result = client.try_revoke_expired_badge(&intruder, &1);
        assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
    }

    #[test]
    fn rejects_revoke_of_unknown_badge() {
        let env = Env::default();
        let (admin, client) = setup(&env);

        let result = client.try_revoke_expired_badge(&admin, &99);
        assert_eq!(result, Err(Ok(LumentixError::BadgeNotFound)));
    }

    #[test]
    fn get_badge_returns_not_found() {
        let env = Env::default();
        let (_admin, client) = setup(&env);

        let result = client.try_get_badge(&404);
        assert_eq!(result, Err(Ok(LumentixError::BadgeNotFound)));
    }

    #[test]
    fn check_milestone_eligibility_mirrors_thresholds() {
        let env = Env::default();
        let (_admin, client) = setup(&env);
        let owner = Address::generate(&env);

        assert!(!client.check_milestone_eligibility(&owner, &9u32, &999u32));
        assert!(client.check_milestone_eligibility(&owner, &10u32, &999u32));
        assert!(client.check_milestone_eligibility(&owner, &9u32, &1000u32));
    }
}
