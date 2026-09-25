//! On-chain email campaign records for organizer marketing.
//!
//! Provides `create_email_campaign`, `send_marketing_emails`,
//! `track_email_analytics`, and `get_email_campaign_analytics` as free
//! functions consumed by the main contract
//! ([`crate::lumentix_contract::LumentixContract`]).
//!
//! The contract stores the campaign record, its lifecycle status, and a
//! cumulative engagement ledger. It never transmits mail itself: a campaign
//! moving to [`EmailCampaignStatus::Sent`] records that the organizer
//! dispatched the send, and the engagement counters are supplied afterwards
//! by whatever delivery provider the organizer uses.

use crate::error::LumentixError;
use crate::events::{EmailCampaignAnalyticsRecorded, EmailCampaignCreated, EmailCampaignSent};
use crate::types::PERSISTENT_LIFETIME;
use crate::types::{EmailCampaign, EmailCampaignAnalytics, EmailCampaignStatus};
use soroban_sdk::{Address, Env, String, Symbol};

// ──────────────────────────── Storage keys ──────────────────────────────────

/// Persistent key for a single campaign.
/// key: (Symbol("email_campaign"), campaign_id: u64)
fn campaign_key(env: &Env, campaign_id: u64) -> (Symbol, u64) {
    (Symbol::new(env, "email_campaign"), campaign_id)
}

/// Persistent key for a campaign's engagement ledger.
/// key: (Symbol("email_analytics"), campaign_id: u64)
fn analytics_key(env: &Env, campaign_id: u64) -> (Symbol, u64) {
    (Symbol::new(env, "email_analytics"), campaign_id)
}

/// Monotonic campaign id counter.
/// key: Symbol("email_campaign_counter")
fn counter_key(env: &Env) -> Symbol {
    Symbol::new(env, "email_campaign_counter")
}

// ──────────────────────────── Public interface ─────────────────────────────

/// Create a draft email campaign owned by `organizer`.
///
/// `event_id` optionally scopes the campaign to a single event; `None` means
/// it targets every event the organizer runs. `subject` and `body` must both
/// be non-empty, otherwise `EmailCampaignInvalidContent` is returned.
pub fn create_email_campaign(
    env: &Env,
    organizer: Address,
    event_id: Option<u64>,
    subject: String,
    body: String,
    recipient_count: u32,
) -> Result<u64, LumentixError> {
    if subject.is_empty() || body.is_empty() {
        return Err(LumentixError::EmailCampaignInvalidContent);
    }

    let campaign_id: u64 = env
        .storage()
        .persistent()
        .get(&counter_key(env))
        .unwrap_or(0u64)
        + 1;
    env.storage()
        .persistent()
        .set(&counter_key(env), &campaign_id);

    let campaign = EmailCampaign {
        id: campaign_id,
        organizer,
        event_id,
        subject,
        body_html: body,
        status: EmailCampaignStatus::Draft,
        created_at: env.ledger().timestamp(),
        scheduled_at: None,
        sent_at: None,
        recipient_count,
    };

    env.storage()
        .persistent()
        .set(&campaign_key(env, campaign_id), &campaign);
    bump_ttl(env, campaign_id);

    EmailCampaignCreated::emit(env, campaign_id, campaign.organizer, recipient_count);

    Ok(campaign_id)
}

/// Mark a draft campaign as sent.
///
/// Only the organizer who created the campaign may send it, and a campaign
/// can only be sent once — a second attempt returns
/// `EmailCampaignAlreadySent`.
pub fn send_marketing_emails(
    env: &Env,
    caller: Address,
    campaign_id: u64,
) -> Result<EmailCampaign, LumentixError> {
    let key = campaign_key(env, campaign_id);
    let mut campaign: EmailCampaign = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(LumentixError::EmailCampaignNotFound)?;

    if campaign.organizer != caller {
        return Err(LumentixError::EmailCampaignUnauthorized);
    }
    if campaign.status == EmailCampaignStatus::Sent {
        return Err(LumentixError::EmailCampaignAlreadySent);
    }

    campaign.status = EmailCampaignStatus::Sent;
    campaign.sent_at = Some(env.ledger().timestamp());
    env.storage().persistent().set(&key, &campaign);
    bump_ttl(env, campaign_id);

    EmailCampaignSent::emit(env, campaign_id, campaign.recipient_count);

    Ok(campaign)
}

/// Record cumulative engagement counters for a campaign.
///
/// `delivered` may not exceed the campaign's recipient count, otherwise
/// `EmailCampaignInvalidDeliveryCount` is returned. Only the owning organizer
/// may record analytics.
#[allow(clippy::too_many_arguments)]
pub fn track_email_analytics(
    env: &Env,
    organizer: Address,
    campaign_id: u64,
    delivered: u32,
    opened: u32,
    clicked: u32,
    bounced: u32,
    unsubscribed: u32,
) -> Result<EmailCampaignAnalytics, LumentixError> {
    let campaign: EmailCampaign = env
        .storage()
        .persistent()
        .get(&campaign_key(env, campaign_id))
        .ok_or(LumentixError::EmailCampaignNotFound)?;

    if campaign.organizer != organizer {
        return Err(LumentixError::EmailCampaignUnauthorized);
    }
    if delivered > campaign.recipient_count {
        return Err(LumentixError::EmailCampaignInvalidDeliveryCount);
    }

    let analytics = EmailCampaignAnalytics {
        campaign_id,
        total_sent: campaign.recipient_count,
        total_delivered: delivered,
        total_opened: opened,
        total_clicked: clicked,
        total_bounced: bounced,
        total_unsubscribed: unsubscribed,
        last_updated_at: env.ledger().timestamp(),
    };

    env.storage()
        .persistent()
        .set(&analytics_key(env, campaign_id), &analytics);
    env.storage().persistent().extend_ttl(
        &analytics_key(env, campaign_id),
        PERSISTENT_LIFETIME,
        PERSISTENT_LIFETIME,
    );

    EmailCampaignAnalyticsRecorded::emit(env, campaign_id, delivered, opened, clicked);

    Ok(analytics)
}

/// Return a campaign record, or `EmailCampaignNotFound`.
pub fn get_email_campaign(env: &Env, campaign_id: u64) -> Result<EmailCampaign, LumentixError> {
    env.storage()
        .persistent()
        .get(&campaign_key(env, campaign_id))
        .ok_or(LumentixError::EmailCampaignNotFound)
}

/// Return the engagement ledger for a campaign.
///
/// A campaign that has never had analytics recorded reads back as all-zero
/// rather than erroring, so callers can always render a stats view.
pub fn get_email_campaign_analytics(
    env: &Env,
    campaign_id: u64,
) -> Result<EmailCampaignAnalytics, LumentixError> {
    if !env
        .storage()
        .persistent()
        .has(&campaign_key(env, campaign_id))
    {
        return Err(LumentixError::EmailCampaignNotFound);
    }

    Ok(env
        .storage()
        .persistent()
        .get(&analytics_key(env, campaign_id))
        .unwrap_or(EmailCampaignAnalytics {
            campaign_id,
            total_sent: 0,
            total_delivered: 0,
            total_opened: 0,
            total_clicked: 0,
            total_bounced: 0,
            total_unsubscribed: 0,
            last_updated_at: 0,
        }))
}

/// Extend the TTL of a stored campaign record.
fn bump_ttl(env: &Env, campaign_id: u64) {
    env.storage().persistent().extend_ttl(
        &campaign_key(env, campaign_id),
        PERSISTENT_LIFETIME,
        PERSISTENT_LIFETIME,
    );
}
