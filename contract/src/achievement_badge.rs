//! Achievement badge NFTs for gamification milestones.
//!
//! Soulbound badges are minted to attendee wallets when milestone
//! criteria are met. They are non-transferable (soulbound): no contract
//! entry point moves a badge to another owner, and badges live under their
//! own storage keys, separate from tickets, so ticket transfer paths cannot
//! touch them.
//!
//! The contract does not track per-attendee attendance or loyalty points
//! on-chain, so milestone stats are attested by the platform admin at mint
//! time rather than self-reported by the badge owner.
//!
//! An owner can hold at most one active badge per [`Milestone`]. A badge is
//! active while it is neither revoked nor past its expiry. Expired badges can
//! be revoked by the admin, which preserves the record for history.

use crate::error::LumentixError;
use crate::events::AchievementBadgeMinted;
use crate::events::AchievementBadgeRevoked;
use soroban_sdk::{Address, Env, String, Symbol, Vec};

// ──────────────────────────── Types ─────────────────────────────────────────

/// Gamification milestones that can earn a badge.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub enum Milestone {
    /// Attended at least [`MILESTONE_EVENTS_ATTENDED`] events.
    EventsAttended,
    /// Earned at least [`MILESTONE_LOYALTY_POINTS`] loyalty points.
    LoyaltyPoints,
}

impl Milestone {
    /// The stat value an owner must reach to earn this milestone's badge.
    pub fn threshold(&self) -> u32 {
        match self {
            Milestone::EventsAttended => MILESTONE_EVENTS_ATTENDED,
            Milestone::LoyaltyPoints => MILESTONE_LOYALTY_POINTS,
        }
    }
}

/// A soulbound achievement badge record.
#[derive(Clone, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub struct AchievementBadge {
    /// Unique badge identifier.
    pub badge_id: u64,
    /// Wallet that earned the badge.
    pub owner: Address,
    /// The milestone this badge certifies.
    pub milestone: Milestone,
    /// Human-readable label (e.g. "Attended 10 Events").
    pub label: String,
    /// Ledger timestamp when the badge was minted.
    pub minted_at: u64,
    /// Ledger timestamp when the badge expires (0 = no expiry).
    pub expires_at: u64,
    /// Whether the badge has been revoked.
    pub revoked: bool,
}

impl AchievementBadge {
    /// Whether the badge has reached its expiry timestamp.
    pub fn is_expired(&self, now: u64) -> bool {
        self.expires_at != 0 && now >= self.expires_at
    }

    /// Whether the badge is neither revoked nor expired.
    pub fn is_active(&self, now: u64) -> bool {
        !self.revoked && !self.is_expired(now)
    }
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

/// Check whether `owner` is eligible for a badge for `milestone`.
///
/// `value` is the owner's current stat for that milestone (events attended
/// for [`Milestone::EventsAttended`], loyalty points for
/// [`Milestone::LoyaltyPoints`]). Returns `true` if `value` meets the
/// milestone's threshold and the owner holds no active (non-revoked,
/// non-expired) badge for the same milestone.
pub fn check_milestone_eligibility(
    env: &Env,
    owner: &Address,
    milestone: Milestone,
    value: u32,
) -> bool {
    if value < milestone.threshold() {
        return false;
    }

    let now = env.ledger().timestamp();
    !get_owner_badges(env, owner)
        .iter()
        .any(|badge| badge.milestone == milestone && badge.is_active(now))
}

/// Mint a soulbound achievement badge to `owner` for `milestone`.
///
/// Callers must already have authenticated the platform admin, who attests
/// `value`. `expires_at` is a ledger timestamp; pass `0` for a non-expiring
/// badge. Returns `InvalidBadgeExpiry` if `expires_at` is non-zero and not in
/// the future, and `BadgeNotEligible` if the milestone threshold is not met
/// or the owner already holds an active badge for that milestone.
pub fn mint_achievement_badge(
    env: &Env,
    owner: Address,
    milestone: Milestone,
    label: String,
    value: u32,
    expires_at: u64,
) -> Result<AchievementBadge, LumentixError> {
    let now = env.ledger().timestamp();
    if expires_at != 0 && expires_at <= now {
        return Err(LumentixError::InvalidBadgeExpiry);
    }

    if !check_milestone_eligibility(env, &owner, milestone, value) {
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
        milestone,
        label: label.clone(),
        minted_at: now,
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

    AchievementBadgeMinted::emit(env, badge_id, owner, label);

    Ok(badge)
}

/// Revoke an expired badge by ID.
///
/// Only marks the badge as revoked in storage; does not delete the record
/// so the ledger history is preserved. Returns `BadgeNotFound` if the badge
/// does not exist, `BadgeAlreadyRevoked` on a repeated revoke, and
/// `BadgeNotExpired` if the badge has no expiry or has not reached it yet.
pub fn revoke_expired_badge(env: &Env, badge_id: u64) -> Result<AchievementBadge, LumentixError> {
    let key = badge_key(env, badge_id);
    let mut badge: AchievementBadge = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(LumentixError::BadgeNotFound)?;

    if badge.revoked {
        return Err(LumentixError::BadgeAlreadyRevoked);
    }

    if !badge.is_expired(env.ledger().timestamp()) {
        return Err(LumentixError::BadgeNotExpired);
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
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        Env,
    };

    const START: u64 = 1_000;

    fn setup(env: &Env) -> (Address, LumentixContractClient<'_>) {
        env.mock_all_auths();
        env.ledger().with_mut(|li| li.timestamp = START);
        let contract_id = env.register(LumentixContract, ());
        let client = LumentixContractClient::new(env, &contract_id);
        let admin = Address::generate(env);
        client.initialize(&admin);
        (admin, client)
    }

    fn label(env: &Env, text: &str) -> String {
        String::from_str(env, text)
    }

    fn set_time(env: &Env, timestamp: u64) {
        env.ledger().with_mut(|li| li.timestamp = timestamp);
    }

    #[test]
    fn admin_mints_events_attended_badge() {
        let env = Env::default();
        let (admin, client) = setup(&env);
        let owner = Address::generate(&env);

        let badge = client.mint_achievement_badge(
            &admin,
            &owner,
            &Milestone::EventsAttended,
            &label(&env, "Attended 10 Events"),
            &10u32,
            &0u64,
        );

        assert_eq!(badge.badge_id, 1);
        assert_eq!(badge.owner, owner);
        assert_eq!(badge.milestone, Milestone::EventsAttended);
        assert_eq!(badge.minted_at, START);
        assert!(!badge.revoked);

        assert_eq!(client.get_badge(&1), badge);
        assert_eq!(client.get_owner_badges(&owner).len(), 1);
    }

    #[test]
    fn rejects_mint_by_non_admin() {
        let env = Env::default();
        let (_admin, client) = setup(&env);
        let owner = Address::generate(&env);

        // The owner cannot self-attest their own stats.
        let result = client.try_mint_achievement_badge(
            &owner,
            &owner,
            &Milestone::EventsAttended,
            &label(&env, "Attended 10 Events"),
            &10u32,
            &0u64,
        );
        assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
        assert_eq!(client.get_owner_badges(&owner).len(), 0);
    }

    #[test]
    fn rejects_mint_below_milestone_threshold() {
        let env = Env::default();
        let (admin, client) = setup(&env);
        let owner = Address::generate(&env);

        let events = client.try_mint_achievement_badge(
            &admin,
            &owner,
            &Milestone::EventsAttended,
            &label(&env, "Nope"),
            &9u32,
            &0u64,
        );
        assert_eq!(events, Err(Ok(LumentixError::BadgeNotEligible)));

        // Meeting the events threshold does not qualify for the loyalty badge.
        let loyalty = client.try_mint_achievement_badge(
            &admin,
            &owner,
            &Milestone::LoyaltyPoints,
            &label(&env, "Nope"),
            &999u32,
            &0u64,
        );
        assert_eq!(loyalty, Err(Ok(LumentixError::BadgeNotEligible)));
    }

    #[test]
    fn owner_can_hold_both_milestone_badges() {
        let env = Env::default();
        let (admin, client) = setup(&env);
        let owner = Address::generate(&env);

        client.mint_achievement_badge(
            &admin,
            &owner,
            &Milestone::EventsAttended,
            &label(&env, "Attended 10 Events"),
            &10u32,
            &0u64,
        );
        let loyalty = client.mint_achievement_badge(
            &admin,
            &owner,
            &Milestone::LoyaltyPoints,
            &label(&env, "Loyalty Legend"),
            &1_000u32,
            &0u64,
        );

        assert_eq!(loyalty.milestone, Milestone::LoyaltyPoints);
        assert_eq!(client.get_owner_badges(&owner).len(), 2);
    }

    #[test]
    fn rejects_second_active_badge_for_same_milestone() {
        let env = Env::default();
        let (admin, client) = setup(&env);
        let owner = Address::generate(&env);

        client.mint_achievement_badge(
            &admin,
            &owner,
            &Milestone::EventsAttended,
            &label(&env, "First"),
            &10u32,
            &0u64,
        );

        let result = client.try_mint_achievement_badge(
            &admin,
            &owner,
            &Milestone::EventsAttended,
            &label(&env, "Second"),
            &20u32,
            &0u64,
        );
        assert_eq!(result, Err(Ok(LumentixError::BadgeNotEligible)));
        assert!(!client.check_milestone_eligibility(&owner, &Milestone::EventsAttended, &20u32));
    }

    #[test]
    fn eligible_again_after_expiry_and_revoke() {
        let env = Env::default();
        let (admin, client) = setup(&env);
        let owner = Address::generate(&env);
        let expires_at = START + 100;

        client.mint_achievement_badge(
            &admin,
            &owner,
            &Milestone::LoyaltyPoints,
            &label(&env, "Loyalty Legend"),
            &1_000u32,
            &expires_at,
        );
        assert!(!client.check_milestone_eligibility(&owner, &Milestone::LoyaltyPoints, &1_000u32));

        // Expired but not yet revoked: no longer counts as active.
        set_time(&env, expires_at);
        assert!(client.check_milestone_eligibility(&owner, &Milestone::LoyaltyPoints, &1_000u32));

        // After revocation the owner remains eligible and can be re-minted.
        client.revoke_expired_badge(&admin, &1);
        assert!(client.check_milestone_eligibility(&owner, &Milestone::LoyaltyPoints, &1_000u32));
        let renewed = client.mint_achievement_badge(
            &admin,
            &owner,
            &Milestone::LoyaltyPoints,
            &label(&env, "Loyalty Legend"),
            &1_000u32,
            &0u64,
        );
        assert_eq!(renewed.badge_id, 2);
    }

    #[test]
    fn rejects_mint_with_past_expiry() {
        let env = Env::default();
        let (admin, client) = setup(&env);
        let owner = Address::generate(&env);

        for expires_at in [START - 1, START] {
            let result = client.try_mint_achievement_badge(
                &admin,
                &owner,
                &Milestone::EventsAttended,
                &label(&env, "Stale"),
                &10u32,
                &expires_at,
            );
            assert_eq!(result, Err(Ok(LumentixError::InvalidBadgeExpiry)));
        }
        assert_eq!(client.get_owner_badges(&owner).len(), 0);
    }

    #[test]
    fn rejects_revoke_before_expiry() {
        let env = Env::default();
        let (admin, client) = setup(&env);
        let owner = Address::generate(&env);

        client.mint_achievement_badge(
            &admin,
            &owner,
            &Milestone::EventsAttended,
            &label(&env, "Timed"),
            &10u32,
            &(START + 100),
        );
        client.mint_achievement_badge(
            &admin,
            &owner,
            &Milestone::LoyaltyPoints,
            &label(&env, "Forever"),
            &1_000u32,
            &0u64,
        );

        set_time(&env, START + 99);
        let timed = client.try_revoke_expired_badge(&admin, &1);
        assert_eq!(timed, Err(Ok(LumentixError::BadgeNotExpired)));

        // A non-expiring badge is never expired.
        let forever = client.try_revoke_expired_badge(&admin, &2);
        assert_eq!(forever, Err(Ok(LumentixError::BadgeNotExpired)));

        assert!(!client.get_badge(&1).revoked);
        assert!(!client.get_badge(&2).revoked);
    }

    #[test]
    fn revokes_expired_badge_as_admin() {
        let env = Env::default();
        let (admin, client) = setup(&env);
        let owner = Address::generate(&env);

        client.mint_achievement_badge(
            &admin,
            &owner,
            &Milestone::EventsAttended,
            &label(&env, "Timed"),
            &10u32,
            &(START + 100),
        );

        set_time(&env, START + 100);
        let revoked = client.revoke_expired_badge(&admin, &1);
        assert!(revoked.revoked);
        assert!(client.get_badge(&1).revoked);
    }

    #[test]
    fn rejects_double_revoke() {
        let env = Env::default();
        let (admin, client) = setup(&env);
        let owner = Address::generate(&env);

        client.mint_achievement_badge(
            &admin,
            &owner,
            &Milestone::EventsAttended,
            &label(&env, "Timed"),
            &10u32,
            &(START + 100),
        );

        set_time(&env, START + 200);
        client.revoke_expired_badge(&admin, &1);
        let again = client.try_revoke_expired_badge(&admin, &1);
        assert_eq!(again, Err(Ok(LumentixError::BadgeAlreadyRevoked)));
    }

    #[test]
    fn rejects_revoke_by_non_admin() {
        let env = Env::default();
        let (admin, client) = setup(&env);
        let owner = Address::generate(&env);
        let intruder = Address::generate(&env);

        client.mint_achievement_badge(
            &admin,
            &owner,
            &Milestone::EventsAttended,
            &label(&env, "Timed"),
            &10u32,
            &(START + 100),
        );

        set_time(&env, START + 200);
        let result = client.try_revoke_expired_badge(&intruder, &1);
        assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
        assert!(!client.get_badge(&1).revoked);
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
    fn check_milestone_eligibility_uses_milestone_threshold() {
        let env = Env::default();
        let (_admin, client) = setup(&env);
        let owner = Address::generate(&env);

        assert!(!client.check_milestone_eligibility(&owner, &Milestone::EventsAttended, &9u32));
        assert!(client.check_milestone_eligibility(&owner, &Milestone::EventsAttended, &10u32));
        assert!(!client.check_milestone_eligibility(&owner, &Milestone::LoyaltyPoints, &999u32));
        assert!(client.check_milestone_eligibility(&owner, &Milestone::LoyaltyPoints, &1_000u32));
        // An events count of 10 does not satisfy the 1,000-point milestone.
        assert!(!client.check_milestone_eligibility(&owner, &Milestone::LoyaltyPoints, &10u32));
    }

    #[test]
    fn badges_are_not_transferable() {
        let env = Env::default();
        let (admin, client) = setup(&env);
        let owner = Address::generate(&env);
        let other = Address::generate(&env);

        client.mint_achievement_badge(
            &admin,
            &owner,
            &Milestone::EventsAttended,
            &label(&env, "Attended 10 Events"),
            &10u32,
            &0u64,
        );

        // The only transfer entry point is for tickets, which live under
        // separate storage keys; a badge ID does not resolve to a ticket.
        let result = client.try_transfer_ticket(&1, &owner, &other);
        assert_eq!(result, Err(Ok(LumentixError::TicketNotFound)));

        assert_eq!(client.get_badge(&1).owner, owner);
        assert_eq!(client.get_owner_badges(&owner).len(), 1);
        assert_eq!(client.get_owner_badges(&other).len(), 0);
    }
}
