#![cfg(test)]

use crate::error::LumentixError;
use crate::lumentix_contract::{LumentixContract, LumentixContractClient};
use crate::types::EmailCampaignStatus;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

fn setup() -> (Env, Address, LumentixContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let contract_id = env.register(LumentixContract, ());
    let client = LumentixContractClient::new(&env, &contract_id);
    client.initialize(&admin);

    (env, admin, client)
}

// ─── create_email_campaign ───────────────────────────────────────────────────

#[test]
fn test_create_email_campaign_returns_id() {
    let (env, _, client) = setup();
    let organizer = Address::generate(&env);

    let subject = String::from_str(&env, "Big news from Lumentix!");
    let body = String::from_str(&env, "<h1>Hello</h1><p>Check out our next event.</p>");

    let id = client
        .create_email_campaign(&organizer, &None, &subject, &body, &100u32)
        .unwrap();

    assert_eq!(id, 1u64, "First campaign should have id = 1");
}

#[test]
fn test_create_email_campaign_increments_id() {
    let (env, _, client) = setup();
    let organizer = Address::generate(&env);

    let subject = String::from_str(&env, "Campaign A");
    let body = String::from_str(&env, "<p>Body A</p>");

    let id1 = client
        .create_email_campaign(&organizer, &None, &subject, &body, &50u32)
        .unwrap();

    let subject2 = String::from_str(&env, "Campaign B");
    let body2 = String::from_str(&env, "<p>Body B</p>");

    let id2 = client
        .create_email_campaign(&organizer, &None, &subject2, &body2, &75u32)
        .unwrap();

    assert_eq!(id1 + 1, id2);
}

#[test]
fn test_create_email_campaign_with_event_scope() {
    let (env, _, client) = setup();
    let organizer = Address::generate(&env);

    let subject = String::from_str(&env, "Event-specific campaign");
    let body = String::from_str(&env, "<p>See you there!</p>");

    // scope to event_id = 42
    let id = client
        .create_email_campaign(&organizer, &Some(42u64), &subject, &body, &30u32)
        .unwrap();
    assert_eq!(id, 1u64);

    let saved = client.get_email_campaign(&id).unwrap();
    assert_eq!(saved.event_id, Some(42u64));
    assert_eq!(saved.recipient_count, 30u32);
}

#[test]
fn test_create_campaign_empty_subject_returns_error() {
    let (env, _, client) = setup();
    let organizer = Address::generate(&env);
    let empty = String::from_str(&env, "");
    let body = String::from_str(&env, "<p>Body</p>");

    let result = client.try_create_email_campaign(&organizer, &None, &empty, &body, &10u32);
    assert_eq!(
        result.unwrap_err().unwrap(),
        LumentixError::EmailCampaignInvalidContent
    );
}

#[test]
fn test_create_campaign_empty_body_returns_error() {
    let (env, _, client) = setup();
    let organizer = Address::generate(&env);
    let subject = String::from_str(&env, "Hello");
    let empty_body = String::from_str(&env, "");

    let result = client.try_create_email_campaign(&organizer, &None, &subject, &empty_body, &10u32);
    assert_eq!(
        result.unwrap_err().unwrap(),
        LumentixError::EmailCampaignInvalidContent
    );
}

// ─── send_marketing_emails ───────────────────────────────────────────────────

#[test]
fn test_send_marketing_emails_transitions_to_sent() {
    let (env, _, client) = setup();
    let organizer = Address::generate(&env);

    let subject = String::from_str(&env, "Launch email");
    let body = String::from_str(&env, "<p>We are live!</p>");

    let id = client
        .create_email_campaign(&organizer, &None, &subject, &body, &200u32)
        .unwrap();

    client.send_marketing_emails(&organizer, &id).unwrap();

    let campaign = client.get_email_campaign(&id).unwrap();
    assert_eq!(campaign.status, EmailCampaignStatus::Sent);
    assert!(campaign.sent_at.is_some());
}

#[test]
fn test_send_already_sent_campaign_returns_error() {
    let (env, _, client) = setup();
    let organizer = Address::generate(&env);

    let subject = String::from_str(&env, "Double-send test");
    let body = String::from_str(&env, "<p>Once.</p>");

    let id = client
        .create_email_campaign(&organizer, &None, &subject, &body, &10u32)
        .unwrap();

    client.send_marketing_emails(&organizer, &id).unwrap();

    // Second send should fail
    let result = client.try_send_marketing_emails(&organizer, &id);
    assert_eq!(
        result.unwrap_err().unwrap(),
        LumentixError::EmailCampaignAlreadySent
    );
}

#[test]
fn test_send_by_non_owner_returns_unauthorized() {
    let (env, _, client) = setup();
    let organizer = Address::generate(&env);
    let attacker = Address::generate(&env);

    let subject = String::from_str(&env, "Owned campaign");
    let body = String::from_str(&env, "<p>Mine.</p>");

    let id = client
        .create_email_campaign(&organizer, &None, &subject, &body, &5u32)
        .unwrap();

    let result = client.try_send_marketing_emails(&attacker, &id);
    assert_eq!(
        result.unwrap_err().unwrap(),
        LumentixError::EmailCampaignUnauthorized
    );
}

// ─── track_email_analytics ───────────────────────────────────────────────────

#[test]
fn test_track_email_analytics_stores_values() {
    let (env, _, client) = setup();
    let organizer = Address::generate(&env);

    let subject = String::from_str(&env, "Analytics test");
    let body = String::from_str(&env, "<p>Track me.</p>");

    let id = client
        .create_email_campaign(&organizer, &None, &subject, &body, &100u32)
        .unwrap();
    client.send_marketing_emails(&organizer, &id).unwrap();

    let analytics = client
        .track_email_analytics(&organizer, &id, &90u32, &60u32, &30u32, &5u32, &2u32)
        .unwrap();

    assert_eq!(analytics.total_delivered, 90u32);
    assert_eq!(analytics.total_opened, 60u32);
    assert_eq!(analytics.total_clicked, 30u32);
    assert_eq!(analytics.total_bounced, 5u32);
    assert_eq!(analytics.total_unsubscribed, 2u32);
    assert_eq!(analytics.total_sent, 100u32);
}

#[test]
fn test_track_analytics_delivered_exceeds_sent_returns_error() {
    let (env, _, client) = setup();
    let organizer = Address::generate(&env);

    let subject = String::from_str(&env, "Over-delivery test");
    let body = String::from_str(&env, "<p>Oops.</p>");

    let id = client
        .create_email_campaign(&organizer, &None, &subject, &body, &50u32)
        .unwrap();

    // delivered > recipient_count (50) — should fail
    let result = client.try_track_email_analytics(&organizer, &id, &999u32, &0u32, &0u32, &0u32, &0u32);
    assert_eq!(
        result.unwrap_err().unwrap(),
        LumentixError::EmailCampaignInvalidDeliveryCount
    );
}

#[test]
fn test_get_email_campaign_analytics_returns_initial_zeros() {
    let (env, _, client) = setup();
    let organizer = Address::generate(&env);

    let subject = String::from_str(&env, "New campaign");
    let body = String::from_str(&env, "<p>Hi!</p>");

    let id = client
        .create_email_campaign(&organizer, &None, &subject, &body, &20u32)
        .unwrap();

    let analytics = client.get_email_campaign_analytics(&id).unwrap();
    assert_eq!(analytics.total_sent, 0u32);
    assert_eq!(analytics.total_opened, 0u32);
}
