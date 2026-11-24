//! GDPR data export and right-to-deletion (Issue #1452).
//!
//! Two data-subject rights, adapted to a ledger that cannot erase entries:
//!
//! * **Access / portability** — [`export_user_data`] returns everything the
//!   contract holds about a wallet as one typed, machine-readable record.
//! * **Erasure** — [`request_data_deletion`] soft-deletes the user and
//!   [`anonymize_historical_records`] then cascades through their tickets, the
//!   validation proofs cached for them and the transfer histories those tickets
//!   carry, replacing the wallet with the contract's own address and dropping
//!   personal seat and accessibility details. Ticket counts, tiers, event
//!   attendance and sales figures are untouched, so aggregate analytics stay
//!   correct. Each anonymized ticket is tagged with a per-request pseudonym, so
//!   a deleted user's records remain linkable to each other without being
//!   linkable to the wallet.
//!
//! A ticket for an event that is still upcoming and has not been used,
//! refunded or revoked is retained: erasing its owner would void a live
//! contract of sale. Such tickets are reported as `retained` and can be
//! anonymized by running the cascade again once they are spent.
//!
//! Records are walked in id order, one page at a time, because the contract
//! keeps no index from a wallet to its tickets.

use crate::error::LumentixError;
use crate::events::{DataDeletionRequested, HistoricalRecordsAnonymized, UserDataExported};
use crate::storage;
use crate::types::{EventStatus, Ticket, PERSISTENT_LIFETIME};
use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{Address, Bytes, BytesN, Env, Symbol, Vec};

/// Most ticket ids examined by one export or anonymization call.
pub const MAX_DATA_PAGE_SIZE: u32 = 100;

/// Where a deletion request is in its life.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub enum DeletionStatus {
    /// The user is soft-deleted; some records may still await anonymization.
    Pending,
    /// A full pass anonymized everything and retained nothing.
    Completed,
}

/// A user's right-to-deletion request and the progress made on it.
#[derive(Clone, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub struct DeletionRequest {
    pub user: Address,
    pub requested_at: u64,
    /// Stands in for the wallet on every record anonymized for this request.
    pub pseudonym: BytesN<32>,
    pub status: DeletionStatus,
    /// Tickets anonymized so far in the current pass.
    pub anonymized_count: u32,
    /// Tickets held back so far in the current pass.
    pub retained_count: u32,
    /// Ledger timestamp the request completed; 0 until then.
    pub completed_at: u64,
}

/// One page of a user's exported data.
#[derive(Clone, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub struct UserDataExport {
    pub user: Address,
    pub exported_at: u64,
    /// The user's tickets within the page.
    pub tickets: Vec<Ticket>,
    /// Pass this as `start_ticket_id` for the next page; 0 when the export is complete.
    pub next_ticket_id: u64,
    /// The user's deletion request, if they have made one.
    pub deletion_request: Option<DeletionRequest>,
}

/// Outcome of one anonymization page.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub struct AnonymizationResult {
    pub scanned: u32,
    pub anonymized: u32,
    pub retained: u32,
    /// Pass this as `start_ticket_id` for the next page; 0 when the pass is complete.
    pub next_ticket_id: u64,
    /// True once a full pass has left nothing retained.
    pub completed: bool,
}

/// Aggregate figures kept across anonymization, for analytics.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub struct AnonymizedStats {
    pub tickets_anonymized: u64,
    pub deletions_completed: u64,
}

// ──────────────────────────── Storage ───────────────────────────────────────

/// key: (Symbol("gdpr_request"), user: Address)
fn request_key(env: &Env, user: &Address) -> (Symbol, Address) {
    (Symbol::new(env, "gdpr_request"), user.clone())
}

/// key: (Symbol("gdpr_anon_tkt"), ticket_id: u64) -> pseudonym
fn pseudonym_key(env: &Env, ticket_id: u64) -> (Symbol, u64) {
    (Symbol::new(env, "gdpr_anon_tkt"), ticket_id)
}

/// key: Symbol("gdpr_stats")
fn stats_key(env: &Env) -> Symbol {
    Symbol::new(env, "gdpr_stats")
}

fn store_request(env: &Env, request: &DeletionRequest) {
    let key = request_key(env, &request.user);
    env.storage().persistent().set(&key, request);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

/// A user's deletion request, if they have made one.
pub fn get_deletion_request(env: &Env, user: &Address) -> Option<DeletionRequest> {
    env.storage().persistent().get(&request_key(env, user))
}

/// Whether the user has asked to be deleted. Their data is treated as erased
/// from that moment, even while anonymization is still in progress.
pub fn is_user_deleted(env: &Env, user: &Address) -> bool {
    env.storage().persistent().has(&request_key(env, user))
}

/// Aggregate anonymization counters.
pub fn get_anonymized_stats(env: &Env) -> AnonymizedStats {
    env.storage()
        .persistent()
        .get(&stats_key(env))
        .unwrap_or(AnonymizedStats {
            tickets_anonymized: 0,
            deletions_completed: 0,
        })
}

fn store_stats(env: &Env, stats: &AnonymizedStats) {
    let key = stats_key(env);
    env.storage().persistent().set(&key, stats);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

/// The pseudonym an anonymized ticket carries, if it has been anonymized.
pub fn get_ticket_pseudonym(env: &Env, ticket_id: u64) -> Option<BytesN<32>> {
    env.storage().persistent().get(&pseudonym_key(env, ticket_id))
}

// ──────────────────────────── Helpers ───────────────────────────────────────

/// The `[start, end)` range of ticket ids a page covers, and the cursor for
/// the page after it (0 when this page reaches the last ticket).
fn page_bounds(
    env: &Env,
    start_ticket_id: u64,
    limit: u32,
) -> Result<(u64, u64, u64), LumentixError> {
    if limit == 0 || limit > MAX_DATA_PAGE_SIZE {
        return Err(LumentixError::InvalidDataPageSize);
    }

    let first = start_ticket_id.max(1);
    let past_last = storage::get_next_ticket_id(env);
    let end = first.saturating_add(u64::from(limit)).min(past_last);
    let next = if end < past_last { end } else { 0 };
    Ok((first, end.max(first), next))
}

/// Whether the sale a ticket represents is finished, so the owner's identity is
/// no longer needed to honour it. A ticket for a cancelled event is only spent
/// once refunded, since the refund is paid to the recorded owner.
fn is_spent(env: &Env, ticket: &Ticket) -> bool {
    if ticket.used || ticket.refunded || ticket.revoked {
        return true;
    }
    match storage::get_event(env, ticket.event_id) {
        Ok(event) => event.status == EventStatus::Completed,
        // The event is gone, so there is nothing left to attend.
        Err(_) => true,
    }
}

/// Derive a pseudonym from the wallet, the request time and a random salt.
/// The salt keeps it from being recomputed by someone who knows the wallet.
fn make_pseudonym(env: &Env, user: &Address, requested_at: u64) -> BytesN<32> {
    let salt = env.prng().u64_in_range(0..=u64::MAX);

    let mut buf = Bytes::new(env);
    buf.append(&user.clone().to_xdr(env));
    buf.extend_from_array(&requested_at.to_be_bytes());
    buf.extend_from_array(&salt.to_be_bytes());
    env.crypto().sha256(&buf).to_bytes()
}

// ──────────────────────────── Public interface ──────────────────────────────

/// Export one page of everything the contract holds about `user`.
///
/// Scans up to `limit` ticket ids from `start_ticket_id` (use 0 or 1 to begin)
/// and returns the user's tickets among them with a cursor for the next page.
/// Authorization is the caller's job.
///
/// Fails with `InvalidDataPageSize` for a `limit` of 0 or above
/// [`MAX_DATA_PAGE_SIZE`].
pub fn export_user_data(
    env: &Env,
    user: &Address,
    start_ticket_id: u64,
    limit: u32,
) -> Result<UserDataExport, LumentixError> {
    let (first, end, next_ticket_id) = page_bounds(env, start_ticket_id, limit)?;

    let mut tickets: Vec<Ticket> = Vec::new(env);
    for ticket_id in first..end {
        if let Ok(ticket) = storage::get_ticket(env, ticket_id) {
            if ticket.owner == *user {
                tickets.push_back(ticket);
            }
        }
    }

    UserDataExported::emit(env, user.clone(), tickets.len());

    Ok(UserDataExport {
        user: user.clone(),
        exported_at: env.ledger().timestamp(),
        tickets,
        next_ticket_id,
        deletion_request: get_deletion_request(env, user),
    })
}

/// Record a right-to-deletion request and soft-delete the user.
///
/// Fails with `DeletionAlreadyRequested` if one is already on record.
/// Authorization is the caller's job.
pub fn request_data_deletion(env: &Env, user: &Address) -> Result<DeletionRequest, LumentixError> {
    if is_user_deleted(env, user) {
        return Err(LumentixError::DeletionAlreadyRequested);
    }

    let requested_at = env.ledger().timestamp();
    let request = DeletionRequest {
        user: user.clone(),
        requested_at,
        pseudonym: make_pseudonym(env, user, requested_at),
        status: DeletionStatus::Pending,
        anonymized_count: 0,
        retained_count: 0,
        completed_at: 0,
    };
    store_request(env, &request);

    DataDeletionRequested::emit(env, user.clone(), requested_at);
    Ok(request)
}

/// Anonymize one page of a deleted user's records.
///
/// Scans up to `limit` ticket ids from `start_ticket_id` (use 0 or 1 to begin
/// a pass). Spent tickets owned by the user (see the module docs) have their
/// owner replaced by the contract address, their seat and accessibility details
/// cleared, and the user replaced in their transfer history and cached
/// validation proof; each is tagged with the request's pseudonym. Tickets for
/// upcoming events are counted as retained. Counters accumulate across the
/// pages of a pass and reset when a pass starts from the beginning. When the
/// last page of a pass retains nothing, the request completes.
///
/// Fails with `DeletionNotRequested` if the user has no request on record and
/// `InvalidDataPageSize` for a `limit` of 0 or above [`MAX_DATA_PAGE_SIZE`].
pub fn anonymize_historical_records(
    env: &Env,
    user: &Address,
    start_ticket_id: u64,
    limit: u32,
) -> Result<AnonymizationResult, LumentixError> {
    let mut request =
        get_deletion_request(env, user).ok_or(LumentixError::DeletionNotRequested)?;
    let (first, end, next_ticket_id) = page_bounds(env, start_ticket_id, limit)?;

    // A pass restarted from the top recounts from zero.
    if first == 1 {
        request.anonymized_count = 0;
        request.retained_count = 0;
    }

    let sink = env.current_contract_address();
    let mut anonymized: u32 = 0;
    let mut retained: u32 = 0;

    for ticket_id in first..end {
        let mut ticket = match storage::get_ticket(env, ticket_id) {
            Ok(ticket) => ticket,
            Err(_) => continue,
        };
        if ticket.owner != *user {
            continue;
        }

        if !is_spent(env, &ticket) {
            retained += 1;
            continue;
        }

        ticket.owner = sink.clone();
        ticket.seat_id = None;
        ticket.accessibility_type = None;
        storage::set_ticket(env, ticket_id, &ticket);
        storage::replace_address_in_transfer_history(env, ticket_id, user, &sink);

        if let Some(mut proof) = storage::get_validation_proof(env, ticket_id) {
            proof.owner = sink.clone();
            storage::set_validation_proof(env, ticket_id, &proof);
        }

        let key = pseudonym_key(env, ticket_id);
        env.storage().persistent().set(&key, &request.pseudonym);
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
        anonymized += 1;
    }

    request.anonymized_count = request.anonymized_count.saturating_add(anonymized);
    request.retained_count = request.retained_count.saturating_add(retained);

    let mut stats = get_anonymized_stats(env);
    stats.tickets_anonymized += u64::from(anonymized);

    let pass_done = next_ticket_id == 0;
    let completed = pass_done && request.retained_count == 0;
    if completed && request.status != DeletionStatus::Completed {
        request.status = DeletionStatus::Completed;
        request.completed_at = env.ledger().timestamp();
        stats.deletions_completed += 1;
    }
    store_request(env, &request);
    store_stats(env, &stats);

    HistoricalRecordsAnonymized::emit(env, user.clone(), anonymized, retained, completed);

    Ok(AnonymizationResult {
        scanned: (end - first) as u32,
        anonymized,
        retained,
        next_ticket_id,
        completed,
    })
}
