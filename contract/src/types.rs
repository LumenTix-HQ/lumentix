use soroban_sdk::{contracttype, Address, String, Vec};

pub const INSTANCE_LIFETIME: u32 = 535_680; // ~30 days
pub const PERSISTENT_LIFETIME: u32 = 535_680; // ~30 days
pub const TEMPORARY_LIFETIME: u32 = 17_280; // ~1 day

/// Event status enum mirroring backend statuses
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EventStatus {
    Draft,
    Published,
    Completed,
    Cancelled,
}

/// Event structure
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Event {
    pub id: u64,
    pub organizer: Address,
    pub name: String,
    pub description: String,
    pub location: String,
    pub start_time: u64,
    pub end_time: u64,
    pub ticket_price: i128,
    pub max_tickets: u32,
    pub tickets_sold: u32,
    pub status: EventStatus,
    pub paused: bool,
    pub currency: String,
    pub accessibility_wheelchair: u32,
    pub accessibility_hearing: u32,
    pub accessibility_visual: u32,
}

/// Ticket structure
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Ticket {
    pub id: u64,
    pub event_id: u64,
    pub owner: Address,
    pub purchase_time: u64,
    pub used: bool,
    pub refunded: bool,
    /// Set by admin via [`crate::lumentix_contract::LumentixContract::revoke_ticket`]; invalidates the ticket.
    pub revoked: bool,
    pub vip_tier: Option<String>,
    pub seat_id: Option<String>,
    pub accessibility_type: Option<String>,
}

/// A single record in a ticket's transfer history
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TicketTransferRecord {
    /// Address that sent the ticket
    pub from: Address,
    /// Address that received the ticket
    pub to: Address,
    /// Ledger timestamp when the transfer occurred
    pub timestamp: u64,
}

/// Fee collected event for tracking platform fees
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FeeCollectedEvent {
    pub ticket_id: u64,
    pub event_id: u64,
    pub platform_fee: i128,
    pub organizer_amount: i128,
}

// ── VIP Tier System ────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VipTier {
    pub name: String,
    pub price: i128,
    pub max_slots: u32,
    pub filled_slots: u32,
    pub benefits: Vec<String>,
}

// ── Accessibility Features ─────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AccessibilityInventory {
    pub wheelchair_available: u32,
    pub wheelchair_total: u32,
    pub hearing_available: u32,
    pub hearing_total: u32,
    pub visual_available: u32,
    pub visual_total: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AccessibilityBooking {
    pub id: u64,
    pub event_id: u64,
    pub ticket_id: u64,
    pub attendee: Address,
    pub accommodation_type: String,
    pub approved: bool,
}

// ── Seat Selection / Venue Mapping ─────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SeatCategory {
    Standard,
    Premium,
    Vip,
    Balcony,
    Floor,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VenueSection {
    pub name: String,
    pub category: SeatCategory,
    pub rows: u32,
    pub seats_per_row: u32,
    pub price_multiplier: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VenueLayout {
    pub sections: Vec<VenueSection>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Seat {
    pub section: String,
    pub row: u32,
    pub number: u32,
    pub occupied: bool,
    pub held_until: u64,
    pub held_by: Option<Address>,
}

// ── Multi-Currency ─────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CurrencyConfig {
    pub code: String,
    pub decimals: u32,
    pub oracle_price: i128,
    pub last_updated: u64,
}

// ── Waitlist ───────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WaitlistOffer {
    pub quantity: u32,
    pub expires_at: u64,
}

// ── Insurance System ───────────────────────────────────────────────────────

/// Cancellation reason enum for insurance claims
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CancellationReason {
    EventCancelledByOrganizer,
    ForceMajeure,
    VenueUnavailable,
    ArtistPerformerUnavailable,
    HealthSafetyConcerns,
    GovernmentRestriction,
    Other,
}

/// Insurance policy for a ticket
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InsurancePolicy {
    pub id: u64,
    pub ticket_id: u64,
    pub event_id: u64,
    pub holder: Address,
    pub premium_paid: i128,
    pub coverage_amount: i128,
    pub purchase_time: u64,
    pub active: bool,
    pub claim_processed: bool,
}

/// Insurance pool balance managed by smart contract
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InsurancePool {
    pub total_balance: i128,
    pub total_policies: u32,
    pub total_claims_paid: i128,
}

// ── Review & Reputation System ─────────────────────────────────────────────

/// A single event review submitted by a verified attendee
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EventReview {
    pub id: u64,
    pub event_id: u64,
    pub reviewer: Address,
    pub organizer: Address,
    pub ticket_id: u64,
    /// Star rating 1–5
    pub rating: u32,
    pub comment: String,
    pub attendance_verified: bool,
    pub timestamp: u64,
}

/// Aggregated reputation score for an organizer
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OrganizerReputation {
    pub organizer: Address,
    /// Weighted score 0–10000 (divide by 100 for 0.00–100.00)
    pub reputation_score: u32,
    /// Average rating × 100 (e.g. 420 = 4.20 stars)
    pub average_rating_x100: u32,
    pub total_reviews: u32,
    pub total_ratings_sum: u32,
}
