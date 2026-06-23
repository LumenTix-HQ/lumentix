use soroban_sdk::{contracttype, Address, BytesN, String, Vec};

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

// ═══════════════════════════════════════════════════════════════════════════
// Smart Contract Upgrade Mechanism
// ═══════════════════════════════════════════════════════════════════════════

/// Represents the current state of an upgrade proposal
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum UpgradeState {
    Pending,
    Approved,
    Executed,
    Rejected,
}

/// An upgrade proposal to replace the contract WASM
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradeProposal {
    pub proposal_id: u64,
    pub proposer: Address,
    pub new_wasm_hash: BytesN<32>,
    pub description: String,
    pub created_at: u64,
    pub voting_deadline: u64,
    pub state: UpgradeState,
    pub yes_votes: u32,
    pub no_votes: u32,
    pub required_yes_votes: u32,
    pub total_voters: u32,
}

/// A record of a single vote on an upgrade proposal
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradeVote {
    pub voter: Address,
    pub proposal_id: u64,
    pub vote_yes: bool,
    pub timestamp: u64,
}

/// Governance configuration for the upgrade mechanism
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradeGovernanceConfig {
    pub voting_period_seconds: u64,
    pub required_approval_percentage: u32,
    pub governance_members: Vec<Address>,
}

// ═══════════════════════════════════════════════════════════════════════════
// Carbon Offset Program
// ═══════════════════════════════════════════════════════════════════════════

/// Result of a carbon footprint calculation
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CarbonFootprint {
    pub event_id: u64,
    pub venue_footprint_kg: i128,
    pub attendance_footprint_kg: i128,
    pub travel_footprint_kg: i128,
    pub total_footprint_kg: i128,
    pub calculated_at: u64,
}

/// A carbon offset purchase record
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CarbonOffsetPurchase {
    pub purchase_id: u64,
    pub event_id: u64,
    pub purchaser: Address,
    pub offset_amount_kg: i128,
    pub cost: i128,
    pub project_id: String,
    pub timestamp: u64,
    pub verified: bool,
}

/// Aggregated environmental impact tracking for an event
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EnvironmentalImpact {
    pub event_id: u64,
    pub total_footprint_kg: i128,
    pub total_offset_kg: i128,
    pub net_impact_kg: i128,
    pub total_purchases: u32,
    pub neutral_status: bool,
}

// ═══════════════════════════════════════════════════════════════════════════
// Blockchain-Based Identity Verification
// ═══════════════════════════════════════════════════════════════════════════

/// Supported identity provider types
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum IdentityProvider {
    Stellar,
    Ethereum,
    Solana,
    Polygon,
    Other(String),
}

/// An identity credential issued on-chain
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IdentityCredential {
    pub credential_id: u64,
    pub subject: Address,
    pub provider: IdentityProvider,
    pub provider_id: String,
    pub issued_at: u64,
    pub expires_at: u64,
    pub revoked: bool,
    pub metadata_hash: BytesN<32>,
    pub level: u32,
}

/// Verification proof for an identity credential
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IdentityProof {
    pub credential_id: u64,
    pub subject: Address,
    pub signature: BytesN<64>,
    pub timestamp: u64,
}

// ═══════════════════════════════════════════════════════════════════════════
// Cross-Chain Ticket Portability
// ═══════════════════════════════════════════════════════════════════════════

/// Status of a cross-chain transfer
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CrossChainTransferStatus {
    Initiated,
    BridgeValidated,
    Completed,
    Failed,
    Expired,
}

/// A cross-chain ticket transfer request
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CrossChainTransfer {
    pub transfer_id: u64,
    pub ticket_id: u64,
    pub event_id: u64,
    pub sender: Address,
    pub recipient: Address,
    pub source_chain: String,
    pub target_chain: String,
    pub status: CrossChainTransferStatus,
    pub initiated_at: u64,
    pub bridge_tx_hash: Option<String>,
    pub completed_at: Option<u64>,
}

/// A validated bridge transaction for cross-chain transfer
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BridgeTransaction {
    pub tx_hash: String,
    pub source_chain: String,
    pub target_chain: String,
    pub sender: Address,
    pub recipient: Address,
    pub ticket_id: u64,
    pub validated: bool,
    pub validation_time: u64,
    pub block_number: u64,
}

// ═══════════════════════════════════════════════════════════════════════════
// Merchandise & NFT Collectibles
// ═══════════════════════════════════════════════════════════════════════════

/// Rarity tier for NFT collectibles
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RarityTier {
    Common,
    Uncommon,
    Rare,
    Epic,
    Legendary,
}

/// Event merchandise item
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EventMerchandise {
    pub id: u64,
    pub event_id: u64,
    pub name: String,
    pub description: String,
    pub price: i128,
    pub total_supply: u32,
    pub remaining_supply: u32,
    pub organizer: Address,
    pub active: bool,
}

/// A commemorative NFT collectible for a special event
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NftCollectible {
    pub id: u64,
    pub event_id: u64,
    pub name: String,
    pub description: String,
    pub rarity: RarityTier,
    pub owner: Address,
    pub minted_at: u64,
    pub transferable: bool,
    pub metadata_hash: BytesN<32>,
}

/// Collectible inventory tracking per event
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CollectibleInventory {
    pub event_id: u64,
    pub total_minted: u32,
    pub max_supply: u32,
    pub common_minted: u32,
    pub uncommon_minted: u32,
    pub rare_minted: u32,
    pub epic_minted: u32,
    pub legendary_minted: u32,
}

// ═══════════════════════════════════════════════════════════════════════════
// Dynamic Venue Space Allocation
// ═══════════════════════════════════════════════════════════════════════════

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VenueSpaceAllocation {
    pub event_id: u64,
    pub venue_id: String,
    pub space_id: String,
    pub allocated_capacity: u32,
    pub real_time_demand: u32,
    pub is_optimized: bool,
}

// ═══════════════════════════════════════════════════════════════════════════
// Subscription-Based Access Passes
// ═══════════════════════════════════════════════════════════════════════════

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SubscriptionPlan {
    pub plan_id: u64,
    pub event_series_id: u64,
    pub name: String,
    pub price: i128,
    pub billing_interval: u64,
    pub active: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SubscriptionStatus {
    pub subscriber: Address,
    pub plan_id: u64,
    pub expiration_time: u64,
    pub active: bool,
}

// ═══════════════════════════════════════════════════════════════════════════
// Comprehensive Security Monitoring
// ═══════════════════════════════════════════════════════════════════════════

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SecurityIncident {
    pub incident_id: u64,
    pub affected_address: Address,
    pub threat_level: String,
    pub description: String,
    pub timestamp: u64,
    pub resolved: bool,
}

// ═══════════════════════════════════════════════════════════════════════════
// Personalization Engine
// ═══════════════════════════════════════════════════════════════════════════

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserPreferences {
    pub user: Address,
    pub preferred_categories: Vec<String>,
    pub max_price: i128,
}
