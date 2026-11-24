//! Livestream chat moderation (Issue #1501).
//!
//! Organizers get four levers over an event's livestream chat: banning a user
//! outright, muting one for a while, slowing the whole room down, and
//! filtering words. [`moderate_chat_message`] is the gate a chat relay runs
//! every message through; it applies those rules in a fixed order and answers
//! with a [`ModerationVerdict`] rather than an error, so the bookkeeping a
//! rejected message leaves behind (a recorded violation) is not rolled back
//! with it.
//!
//! The room's settings are stored per event and each user's moderation state
//! per event and user, so a ban in one event's chat says nothing about another.

use crate::error::LumentixError;
use crate::events::{
    ChatMessageModerated, ChatSlowModeSet, ChatUserBanned, ChatUserMuted, ChatUserUnbanned,
    ChatWordFiltersUpdated,
};
use crate::types::PERSISTENT_LIFETIME;
use soroban_sdk::{Address, Env, String, Symbol, Vec};

/// Longest accepted chat message, in bytes.
pub const MAX_CHAT_MESSAGE_LEN: u32 = 280;
/// Most words an event's filter list may hold.
pub const MAX_FILTER_WORDS: u32 = 50;
/// Longest single filter word, in bytes.
pub const MAX_FILTER_WORD_LEN: u32 = 32;
/// Longest slow-mode interval, in seconds (one hour).
pub const MAX_SLOW_MODE_SECONDS: u32 = 3_600;
/// Longest single mute, in seconds (seven days).
pub const MAX_MUTE_SECONDS: u64 = 604_800;

/// What the moderation gate decided about one chat message.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub enum ModerationVerdict {
    /// The message may be shown.
    Allowed,
    /// The sender is banned from this chat.
    Banned,
    /// The sender is muted and the mute has not run out.
    Muted,
    /// The sender posted again before the slow-mode interval passed.
    SlowMode,
    /// The message contains a filtered word.
    FilteredWord,
}

/// Per-event chat room settings.
#[derive(Clone, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub struct ChatSettings {
    pub event_id: u64,
    /// Minimum seconds between one user's messages; 0 turns slow mode off.
    pub slow_mode_seconds: u32,
    /// Lowercase words that block a message containing them.
    pub word_filters: Vec<String>,
    pub updated_at: u64,
}

/// One user's moderation state in one event's chat.
#[derive(Clone, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub struct ChatUserState {
    pub banned: bool,
    pub ban_reason: String,
    /// Ledger timestamp the current mute runs until; 0 when not muted.
    pub muted_until: u64,
    /// Ledger timestamp of the last message let through.
    pub last_message_at: u64,
    /// Messages let through so far.
    pub messages_sent: u32,
    /// Messages turned away for containing a filtered word.
    pub violations: u32,
}

// ──────────────────────────── Storage keys ──────────────────────────────────

/// key: (Symbol("chat_settings"), event_id: u64)
fn settings_key(env: &Env, event_id: u64) -> (Symbol, u64) {
    (Symbol::new(env, "chat_settings"), event_id)
}

/// key: (Symbol("chat_user"), event_id: u64, user: Address)
fn user_key(env: &Env, event_id: u64, user: &Address) -> (Symbol, u64, Address) {
    (Symbol::new(env, "chat_user"), event_id, user.clone())
}

fn store_settings(env: &Env, settings: &ChatSettings) {
    let key = settings_key(env, settings.event_id);
    env.storage().persistent().set(&key, settings);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

fn store_user_state(env: &Env, event_id: u64, user: &Address, state: &ChatUserState) {
    let key = user_key(env, event_id, user);
    env.storage().persistent().set(&key, state);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

/// Chat settings for `event_id`; a room nobody has configured has no slow mode
/// and no filters.
pub fn get_chat_settings(env: &Env, event_id: u64) -> ChatSettings {
    env.storage()
        .persistent()
        .get(&settings_key(env, event_id))
        .unwrap_or_else(|| ChatSettings {
            event_id,
            slow_mode_seconds: 0,
            word_filters: Vec::new(env),
            updated_at: 0,
        })
}

/// A user's moderation state; a user nobody has moderated starts clean.
pub fn get_chat_user_state(env: &Env, event_id: u64, user: &Address) -> ChatUserState {
    env.storage()
        .persistent()
        .get(&user_key(env, event_id, user))
        .unwrap_or_else(|| ChatUserState {
            banned: false,
            ban_reason: String::from_str(env, ""),
            muted_until: 0,
            last_message_at: 0,
            messages_sent: 0,
            violations: 0,
        })
}

// ──────────────────────────── Text helpers ──────────────────────────────────

/// Copy `text` into `buf` lowercased and return the used length.
fn lowercase_into(text: &String, buf: &mut [u8]) -> usize {
    let len = text.len() as usize;
    text.copy_into_slice(&mut buf[..len]);
    buf[..len].make_ascii_lowercase();
    len
}

fn contains_bytes(haystack: &[u8], needle: &[u8]) -> bool {
    if needle.is_empty() || needle.len() > haystack.len() {
        return false;
    }
    haystack.windows(needle.len()).any(|window| window == needle)
}

fn verdict_code(verdict: ModerationVerdict) -> u32 {
    match verdict {
        ModerationVerdict::Allowed => 0,
        ModerationVerdict::Banned => 1,
        ModerationVerdict::Muted => 2,
        ModerationVerdict::SlowMode => 3,
        ModerationVerdict::FilteredWord => 4,
    }
}

// ──────────────────────────── Public interface ───────────────────────────────

/// Run one chat message through the room's rules.
///
/// Checks run in order: ban, mute, word filter, slow mode. A message that
/// passes is stamped as the sender's latest, which is what slow mode measures
/// against. A message turned away for a filtered word counts as a violation;
/// bans, mutes and slow mode do not, since the sender is already being dealt
/// with. `exempt` senders (the organizer and admin) skip every rule.
///
/// Fails with `InvalidChatMessage` for an empty message or one longer than
/// [`MAX_CHAT_MESSAGE_LEN`]. Every moderation outcome is an `Ok` verdict.
pub fn moderate_chat_message(
    env: &Env,
    event_id: u64,
    sender: &Address,
    message: &String,
    exempt: bool,
) -> Result<ModerationVerdict, LumentixError> {
    if message.len() == 0 || message.len() > MAX_CHAT_MESSAGE_LEN {
        return Err(LumentixError::InvalidChatMessage);
    }
    if exempt {
        return Ok(ModerationVerdict::Allowed);
    }

    let now = env.ledger().timestamp();
    let settings = get_chat_settings(env, event_id);
    let mut state = get_chat_user_state(env, event_id, sender);

    let verdict = if state.banned {
        ModerationVerdict::Banned
    } else if state.muted_until > now {
        ModerationVerdict::Muted
    } else if message_has_filtered_word(&settings, message) {
        ModerationVerdict::FilteredWord
    } else if settings.slow_mode_seconds > 0
        && state.messages_sent > 0
        && now < state.last_message_at.saturating_add(u64::from(settings.slow_mode_seconds))
    {
        ModerationVerdict::SlowMode
    } else {
        ModerationVerdict::Allowed
    };

    match verdict {
        ModerationVerdict::Allowed => {
            state.last_message_at = now;
            state.messages_sent = state.messages_sent.saturating_add(1);
            store_user_state(env, event_id, sender, &state);
        }
        ModerationVerdict::FilteredWord => {
            state.violations = state.violations.saturating_add(1);
            store_user_state(env, event_id, sender, &state);
            ChatMessageModerated::emit(env, event_id, sender.clone(), verdict_code(verdict));
        }
        _ => ChatMessageModerated::emit(env, event_id, sender.clone(), verdict_code(verdict)),
    }

    Ok(verdict)
}

fn message_has_filtered_word(settings: &ChatSettings, message: &String) -> bool {
    if settings.word_filters.is_empty() {
        return false;
    }

    let mut message_buf = [0u8; MAX_CHAT_MESSAGE_LEN as usize];
    let message_len = lowercase_into(message, &mut message_buf);

    for word in settings.word_filters.iter() {
        let mut word_buf = [0u8; MAX_FILTER_WORD_LEN as usize];
        let word_len = lowercase_into(&word, &mut word_buf);
        if contains_bytes(&message_buf[..message_len], &word_buf[..word_len]) {
            return true;
        }
    }
    false
}

/// Set the minimum seconds between one user's messages; 0 turns slow mode off.
///
/// Fails with `InvalidSlowModeInterval` above [`MAX_SLOW_MODE_SECONDS`].
pub fn set_slow_mode(
    env: &Env,
    event_id: u64,
    seconds: u32,
) -> Result<ChatSettings, LumentixError> {
    if seconds > MAX_SLOW_MODE_SECONDS {
        return Err(LumentixError::InvalidSlowModeInterval);
    }

    let mut settings = get_chat_settings(env, event_id);
    settings.slow_mode_seconds = seconds;
    settings.updated_at = env.ledger().timestamp();
    store_settings(env, &settings);
    ChatSlowModeSet::emit(env, event_id, seconds);

    Ok(settings)
}

/// Replace the room's filtered words. Words are stored lowercase and matched
/// anywhere inside a message, ignoring case.
///
/// Fails with `InvalidChatWordFilter` for more than [`MAX_FILTER_WORDS`]
/// words, or a word that is empty or longer than [`MAX_FILTER_WORD_LEN`].
pub fn set_word_filters(
    env: &Env,
    event_id: u64,
    words: Vec<String>,
) -> Result<ChatSettings, LumentixError> {
    if words.len() > MAX_FILTER_WORDS {
        return Err(LumentixError::InvalidChatWordFilter);
    }

    let mut normalized = Vec::new(env);
    for word in words.iter() {
        if word.len() == 0 || word.len() > MAX_FILTER_WORD_LEN {
            return Err(LumentixError::InvalidChatWordFilter);
        }
        let mut buf = [0u8; MAX_FILTER_WORD_LEN as usize];
        let len = lowercase_into(&word, &mut buf);
        normalized.push_back(String::from_bytes(env, &buf[..len]));
    }

    let mut settings = get_chat_settings(env, event_id);
    settings.word_filters = normalized;
    settings.updated_at = env.ledger().timestamp();
    store_settings(env, &settings);
    ChatWordFiltersUpdated::emit(env, event_id, settings.word_filters.len());

    Ok(settings)
}

/// Ban `user` from the event's chat.
///
/// Fails with `ChatUserAlreadyBanned` when they already are.
pub fn ban_chat_user(
    env: &Env,
    event_id: u64,
    user: &Address,
    reason: String,
) -> Result<ChatUserState, LumentixError> {
    let mut state = get_chat_user_state(env, event_id, user);
    if state.banned {
        return Err(LumentixError::ChatUserAlreadyBanned);
    }

    state.banned = true;
    state.ban_reason = reason.clone();
    store_user_state(env, event_id, user, &state);
    ChatUserBanned::emit(env, event_id, user.clone(), reason);

    Ok(state)
}

/// Lift a ban.
///
/// Fails with `ChatUserNotBanned` when the user is not banned.
pub fn unban_chat_user(
    env: &Env,
    event_id: u64,
    user: &Address,
) -> Result<ChatUserState, LumentixError> {
    let mut state = get_chat_user_state(env, event_id, user);
    if !state.banned {
        return Err(LumentixError::ChatUserNotBanned);
    }

    state.banned = false;
    state.ban_reason = String::from_str(env, "");
    store_user_state(env, event_id, user, &state);
    ChatUserUnbanned::emit(env, event_id, user.clone());

    Ok(state)
}

/// Mute `user` for `duration_seconds` from now, replacing any earlier mute.
/// A duration of 0 lifts the mute.
///
/// Fails with `InvalidMuteDuration` above [`MAX_MUTE_SECONDS`].
pub fn mute_chat_user(
    env: &Env,
    event_id: u64,
    user: &Address,
    duration_seconds: u64,
) -> Result<ChatUserState, LumentixError> {
    if duration_seconds > MAX_MUTE_SECONDS {
        return Err(LumentixError::InvalidMuteDuration);
    }

    let mut state = get_chat_user_state(env, event_id, user);
    state.muted_until = if duration_seconds == 0 {
        0
    } else {
        env.ledger().timestamp().saturating_add(duration_seconds)
    };
    store_user_state(env, event_id, user, &state);
    ChatUserMuted::emit(env, event_id, user.clone(), state.muted_until);

    Ok(state)
}
