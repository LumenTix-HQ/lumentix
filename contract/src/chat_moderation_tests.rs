#![allow(warnings)]
//! Tests for livestream chat moderation (#1501):
//! `moderate_chat_message`, `set_slow_mode`, `ban_chat_user`.

extern crate std;

use crate::chat_moderation::{ModerationVerdict, MAX_SLOW_MODE_SECONDS};
use crate::error::LumentixError;
use crate::lumentix_contract::{LumentixContract, LumentixContractClient};
use crate::types::EventStatus;
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Address, Env, String, Vec};

fn setup(env: &Env) -> (LumentixContractClient<'_>, Address) {
    env.mock_all_auths();
    let contract_id = env.register(LumentixContract, ());
    let client = LumentixContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(&admin);
    (client, admin)
}

fn live_event(env: &Env) -> (LumentixContractClient<'_>, Address, Address, u64) {
    let (client, admin) = setup(env);
    let organizer = Address::generate(env);
    let now = env.ledger().timestamp();
    let event_id = client.create_event(
        &organizer,
        &String::from_str(env, "Livestream"),
        &String::from_str(env, "Desc"),
        &String::from_str(env, "Online"),
        &(now + 1_000),
        &(now + 2_000),
        &100i128,
        &50u32,
    );
    client.update_event_status(&event_id, &EventStatus::Published, &organizer);
    (client, admin, organizer, event_id)
}

fn text(env: &Env, s: &str) -> String {
    String::from_str(env, s)
}

fn words(env: &Env, list: &[&str]) -> Vec<String> {
    let mut out = Vec::new(env);
    for w in list {
        out.push_back(String::from_str(env, w));
    }
    out
}

#[test]
fn unmoderated_chat_lets_messages_through() {
    let env = Env::default();
    let (client, _admin, _organizer, event_id) = live_event(&env);
    let viewer = Address::generate(&env);

    let verdict = client.moderate_chat_message(&viewer, &event_id, &text(&env, "great set!"));
    assert_eq!(verdict, ModerationVerdict::Allowed);
    assert_eq!(client.get_chat_user_state(&event_id, &viewer).messages_sent, 1);
}

#[test]
fn message_must_be_non_empty_and_bounded() {
    let env = Env::default();
    let (client, _admin, _organizer, event_id) = live_event(&env);
    let viewer = Address::generate(&env);

    let result = client.try_moderate_chat_message(&viewer, &event_id, &text(&env, ""));
    assert_eq!(result, Err(Ok(LumentixError::InvalidChatMessage)));

    let long = "a".repeat(281);
    let result = client.try_moderate_chat_message(&viewer, &event_id, &text(&env, &long));
    assert_eq!(result, Err(Ok(LumentixError::InvalidChatMessage)));
}

#[test]
fn unknown_event_is_rejected() {
    let env = Env::default();
    let (client, _admin) = setup(&env);
    let viewer = Address::generate(&env);

    let result = client.try_moderate_chat_message(&viewer, &999u64, &text(&env, "hi"));
    assert_eq!(result, Err(Ok(LumentixError::EventNotFound)));
}

#[test]
fn banned_user_is_turned_away_until_unbanned() {
    let env = Env::default();
    let (client, _admin, organizer, event_id) = live_event(&env);
    let viewer = Address::generate(&env);

    let state = client.ban_chat_user(&organizer, &event_id, &viewer, &text(&env, "spam"));
    assert!(state.banned);
    assert_eq!(state.ban_reason, text(&env, "spam"));

    let verdict = client.moderate_chat_message(&viewer, &event_id, &text(&env, "hello"));
    assert_eq!(verdict, ModerationVerdict::Banned);

    client.unban_chat_user(&organizer, &event_id, &viewer);
    let verdict = client.moderate_chat_message(&viewer, &event_id, &text(&env, "hello"));
    assert_eq!(verdict, ModerationVerdict::Allowed);
}

#[test]
fn ban_is_scoped_to_one_event() {
    let env = Env::default();
    let (client, _admin, organizer, event_id) = live_event(&env);
    let now = env.ledger().timestamp();
    let other_event = client.create_event(
        &organizer,
        &text(&env, "Other"),
        &text(&env, "Desc"),
        &text(&env, "Online"),
        &(now + 1_000),
        &(now + 2_000),
        &100i128,
        &50u32,
    );
    let viewer = Address::generate(&env);

    client.ban_chat_user(&organizer, &event_id, &viewer, &text(&env, "spam"));
    let verdict = client.moderate_chat_message(&viewer, &other_event, &text(&env, "hello"));
    assert_eq!(verdict, ModerationVerdict::Allowed);
}

#[test]
fn ban_and_unban_reject_repeats() {
    let env = Env::default();
    let (client, _admin, organizer, event_id) = live_event(&env);
    let viewer = Address::generate(&env);

    let result = client.try_unban_chat_user(&organizer, &event_id, &viewer);
    assert_eq!(result, Err(Ok(LumentixError::ChatUserNotBanned)));

    client.ban_chat_user(&organizer, &event_id, &viewer, &text(&env, "spam"));
    let result = client.try_ban_chat_user(&organizer, &event_id, &viewer, &text(&env, "again"));
    assert_eq!(result, Err(Ok(LumentixError::ChatUserAlreadyBanned)));
}

#[test]
fn only_organizer_or_admin_may_moderate() {
    let env = Env::default();
    let (client, admin, organizer, event_id) = live_event(&env);
    let stranger = Address::generate(&env);
    let viewer = Address::generate(&env);

    let result = client.try_ban_chat_user(&stranger, &event_id, &viewer, &text(&env, "x"));
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
    let result = client.try_set_slow_mode(&stranger, &event_id, &10u32);
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
    let result = client.try_mute_chat_user(&stranger, &event_id, &viewer, &60u64);
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));

    // The contract admin can step in.
    assert!(client
        .try_ban_chat_user(&admin, &event_id, &viewer, &text(&env, "x"))
        .is_ok());
}

#[test]
fn organizer_and_admin_cannot_be_banned_or_muted_and_are_never_moderated() {
    let env = Env::default();
    let (client, admin, organizer, event_id) = live_event(&env);

    let result = client.try_ban_chat_user(&admin, &event_id, &organizer, &text(&env, "x"));
    assert_eq!(result, Err(Ok(LumentixError::CannotModerateOrganizer)));
    let result = client.try_mute_chat_user(&organizer, &event_id, &admin, &60u64);
    assert_eq!(result, Err(Ok(LumentixError::CannotModerateOrganizer)));

    client.set_slow_mode(&organizer, &event_id, &60u32);
    client.set_chat_word_filters(&organizer, &event_id, &words(&env, &["spoiler"]));
    for _ in 0..2 {
        let verdict = client.moderate_chat_message(&organizer, &event_id, &text(&env, "spoiler"));
        assert_eq!(verdict, ModerationVerdict::Allowed);
    }
}

#[test]
fn mute_blocks_until_it_runs_out() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    let (client, _admin, organizer, event_id) = live_event(&env);
    let viewer = Address::generate(&env);

    let state = client.mute_chat_user(&organizer, &event_id, &viewer, &120u64);
    assert_eq!(state.muted_until, 1_120);

    let verdict = client.moderate_chat_message(&viewer, &event_id, &text(&env, "hello"));
    assert_eq!(verdict, ModerationVerdict::Muted);

    env.ledger().with_mut(|li| li.timestamp = 1_120);
    let verdict = client.moderate_chat_message(&viewer, &event_id, &text(&env, "hello"));
    assert_eq!(verdict, ModerationVerdict::Allowed);
}

#[test]
fn zero_duration_unmutes_and_long_mutes_are_rejected() {
    let env = Env::default();
    let (client, _admin, organizer, event_id) = live_event(&env);
    let viewer = Address::generate(&env);

    client.mute_chat_user(&organizer, &event_id, &viewer, &120u64);
    let state = client.mute_chat_user(&organizer, &event_id, &viewer, &0u64);
    assert_eq!(state.muted_until, 0);
    let verdict = client.moderate_chat_message(&viewer, &event_id, &text(&env, "hello"));
    assert_eq!(verdict, ModerationVerdict::Allowed);

    let result = client.try_mute_chat_user(&organizer, &event_id, &viewer, &604_801u64);
    assert_eq!(result, Err(Ok(LumentixError::InvalidMuteDuration)));
}

#[test]
fn slow_mode_spaces_out_a_users_messages() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    let (client, _admin, organizer, event_id) = live_event(&env);
    let viewer = Address::generate(&env);
    let other = Address::generate(&env);

    let settings = client.set_slow_mode(&organizer, &event_id, &30u32);
    assert_eq!(settings.slow_mode_seconds, 30);

    assert_eq!(
        client.moderate_chat_message(&viewer, &event_id, &text(&env, "one")),
        ModerationVerdict::Allowed
    );

    env.ledger().with_mut(|li| li.timestamp = 1_029);
    assert_eq!(
        client.moderate_chat_message(&viewer, &event_id, &text(&env, "two")),
        ModerationVerdict::SlowMode
    );
    // Slow mode is per user.
    assert_eq!(
        client.moderate_chat_message(&other, &event_id, &text(&env, "hi")),
        ModerationVerdict::Allowed
    );

    env.ledger().with_mut(|li| li.timestamp = 1_030);
    assert_eq!(
        client.moderate_chat_message(&viewer, &event_id, &text(&env, "two")),
        ModerationVerdict::Allowed
    );
}

#[test]
fn slow_mode_can_be_switched_off_and_is_bounded() {
    let env = Env::default();
    let (client, _admin, organizer, event_id) = live_event(&env);
    let viewer = Address::generate(&env);

    client.set_slow_mode(&organizer, &event_id, &30u32);
    client.set_slow_mode(&organizer, &event_id, &0u32);
    for _ in 0..3 {
        assert_eq!(
            client.moderate_chat_message(&viewer, &event_id, &text(&env, "spam")),
            ModerationVerdict::Allowed
        );
    }

    let result = client.try_set_slow_mode(&organizer, &event_id, &(MAX_SLOW_MODE_SECONDS + 1));
    assert_eq!(result, Err(Ok(LumentixError::InvalidSlowModeInterval)));
}

#[test]
fn word_filter_blocks_case_insensitively_and_counts_violations() {
    let env = Env::default();
    let (client, _admin, organizer, event_id) = live_event(&env);
    let viewer = Address::generate(&env);

    let settings =
        client.set_chat_word_filters(&organizer, &event_id, &words(&env, &["SpoilER", "scam"]));
    // Stored lowercase.
    assert_eq!(settings.word_filters.get(0).unwrap(), text(&env, "spoiler"));

    assert_eq!(
        client.moderate_chat_message(&viewer, &event_id, &text(&env, "No SPOILERS please")),
        ModerationVerdict::FilteredWord
    );
    assert_eq!(
        client.moderate_chat_message(&viewer, &event_id, &text(&env, "total ScAm")),
        ModerationVerdict::FilteredWord
    );
    assert_eq!(
        client.moderate_chat_message(&viewer, &event_id, &text(&env, "lovely show")),
        ModerationVerdict::Allowed
    );

    let state = client.get_chat_user_state(&event_id, &viewer);
    assert_eq!(state.violations, 2);
    assert_eq!(state.messages_sent, 1);
}

#[test]
fn filtered_message_does_not_start_the_slow_mode_clock() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.timestamp = 1_000);
    let (client, _admin, organizer, event_id) = live_event(&env);
    let viewer = Address::generate(&env);

    client.set_slow_mode(&organizer, &event_id, &60u32);
    client.set_chat_word_filters(&organizer, &event_id, &words(&env, &["scam"]));

    assert_eq!(
        client.moderate_chat_message(&viewer, &event_id, &text(&env, "scam")),
        ModerationVerdict::FilteredWord
    );
    assert_eq!(
        client.moderate_chat_message(&viewer, &event_id, &text(&env, "clean message")),
        ModerationVerdict::Allowed
    );
}

#[test]
fn word_filters_are_validated_and_replaced() {
    let env = Env::default();
    let (client, _admin, organizer, event_id) = live_event(&env);

    let result = client.try_set_chat_word_filters(&organizer, &event_id, &words(&env, &[""]));
    assert_eq!(result, Err(Ok(LumentixError::InvalidChatWordFilter)));

    let too_long = "a".repeat(33);
    let result =
        client.try_set_chat_word_filters(&organizer, &event_id, &words(&env, &[too_long.as_str()]));
    assert_eq!(result, Err(Ok(LumentixError::InvalidChatWordFilter)));

    let many: std::vec::Vec<std::string::String> = (0..51).map(|i| std::format!("w{i}")).collect();
    let refs: std::vec::Vec<&str> = many.iter().map(|s| s.as_str()).collect();
    let result = client.try_set_chat_word_filters(&organizer, &event_id, &words(&env, &refs));
    assert_eq!(result, Err(Ok(LumentixError::InvalidChatWordFilter)));

    client.set_chat_word_filters(&organizer, &event_id, &words(&env, &["one"]));
    client.set_chat_word_filters(&organizer, &event_id, &words(&env, &["two"]));
    let settings = client.get_chat_settings(&event_id);
    assert_eq!(settings.word_filters.len(), 1);
    assert_eq!(settings.word_filters.get(0).unwrap(), text(&env, "two"));
}

#[test]
fn ban_takes_priority_over_other_rules() {
    let env = Env::default();
    let (client, _admin, organizer, event_id) = live_event(&env);
    let viewer = Address::generate(&env);

    client.set_chat_word_filters(&organizer, &event_id, &words(&env, &["scam"]));
    client.mute_chat_user(&organizer, &event_id, &viewer, &60u64);
    client.ban_chat_user(&organizer, &event_id, &viewer, &text(&env, "x"));

    assert_eq!(
        client.moderate_chat_message(&viewer, &event_id, &text(&env, "scam")),
        ModerationVerdict::Banned
    );
}
