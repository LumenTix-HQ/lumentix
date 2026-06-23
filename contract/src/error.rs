use soroban_sdk::contracterror;

/// Comprehensive error types for the Lumentix contract
/// Each error has a unique code for debugging and clear feedback to callers
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum LumentixError {
    /// Contract has not been initialized yet
    NotInitialized = 1,

    /// Contract has already been initialized
    AlreadyInitialized = 2,

    /// Caller is not authorized to perform this action
    Unauthorized = 3,

    /// Event with the specified ID does not exist
    EventNotFound = 4,

    /// Ticket with the specified ID does not exist
    TicketNotFound = 5,

    /// Event has reached maximum ticket capacity
    EventSoldOut = 6,

    /// Ticket has already been used/validated
    TicketAlreadyUsed = 7,

    /// Invalid status transition for event or ticket
    InvalidStatusTransition = 8,

    /// Payment amount is less than required
    InsufficientFunds = 9,

    /// Refund is not allowed for this ticket
    RefundNotAllowed = 10,

    /// Event must be cancelled before refunds can be issued
    EventNotCancelled = 11,

    /// Escrow funds have already been released
    EscrowAlreadyReleased = 12,

    /// Amount must be greater than zero
    InvalidAmount = 13,

    /// Capacity must be greater than zero
    CapacityExceeded = 14,

    /// Invalid time range (start time must be before end time)
    InvalidTimeRange = 15,

    /// String field cannot be empty
    EmptyString = 16,

    /// Invalid address provided
    InvalidAddress = 17,

    /// Escrow balance insufficient for operation
    InsufficientEscrow = 18,

    /// Platform fee basis points must be between 0 and 10000
    InvalidPlatformFee = 19,

    /// No platform fees available to withdraw
    NoPlatformFees = 20,

    /// Ticket sales for this event are currently paused
    EventPaused = 21,

    /// Ticket was administratively revoked and cannot be used or transferred
    RevokedTicket = 22,

    // VIP Tier errors (23–29)
    /// VIP tier not found
    VipTierNotFound = 23,
    /// VIP tier is full
    VipTierFull = 24,
    /// VIP tier already exists for this event
    VipTierAlreadyExists = 25,

    // Accessibility errors (30–35)
    /// No accessibility inventory configured for event
    AccessibilityNotConfigured = 30,
    /// Requested accommodation type is not available
    AccommodationUnavailable = 31,
    /// Accessibility booking not found
    AccessibilityBookingNotFound = 32,

    // Seat / Venue errors (36–42)
    /// Venue layout not configured for event
    VenueLayoutNotFound = 36,
    /// Seat not found in venue layout
    SeatNotFound = 37,
    /// Seat is already occupied
    SeatAlreadyOccupied = 38,
    /// Seat is currently held by another user
    SeatHeld = 39,
    /// Seat hold has expired
    SeatHoldExpired = 40,
    /// Invalid seat category
    InvalidSeatCategory = 41,

    // Currency errors (43–46)
    /// Currency not supported
    UnsupportedCurrency = 43,
    /// Oracle price not available
    OraclePriceNotFound = 44,
    /// Currency conversion error
    CurrencyConversionError = 45,

    // Waitlist errors (46–49)
    /// User is already present in the event waitlist
    AlreadyOnWaitlist = 46,
    /// User has no active waitlist offer
    WaitlistOfferNotFound = 47,
    /// Waitlist offer has expired
    WaitlistOfferExpired = 48,

    // Insurance errors (49–55)
    /// Insurance policy not found
    InsurancePolicyNotFound = 49,
    /// Insurance already purchased for this ticket
    InsuranceAlreadyPurchased = 50,
    /// Insurance pool has insufficient funds
    InsufficientInsurancePool = 51,
    /// Invalid cancellation reason for insurance claim
    InvalidCancellationReason = 52,
    /// Insurance claim already processed
    InsuranceClaimAlreadyProcessed = 53,
    /// Insurance policy is not active
    InsurancePolicyNotActive = 54,
    /// Insurance premium amount is invalid
    InvalidInsurancePremium = 55,

    // Review & Reputation errors (56–65)
    /// Review not found
    ReviewNotFound = 56,
    /// Reviewer has already submitted a review for this event
    ReviewAlreadySubmitted = 57,
    /// Reviewer did not attend the event (ticket not used)
    AttendanceNotVerified = 58,
    /// Ticket does not belong to the reviewer
    ReviewerNotTicketOwner = 59,
    /// Event is not completed — reviews only allowed after completion
    EventNotCompleted = 60,
    /// Rating must be between 1 and 5
    InvalidRating = 61,
    /// Ticket does not belong to the reviewed event
    TicketEventMismatch = 62,

    // ═══════════════════════════════════════════════════════════════════════
    // Smart Contract Upgrade errors (63–69)
    // ═══════════════════════════════════════════════════════════════════════
    /// Upgrade proposal not found
    UpgradeProposalNotFound = 63,
    /// Upgrade proposal already exists for this hash
    UpgradeProposalAlreadyExists = 64,
    /// Upgrade proposal is not in voting state
    UpgradeNotInVotingState = 65,
    /// Voter has already voted on this proposal
    UpgradeAlreadyVoted = 66,
    /// Upgrade proposal voting period has expired
    UpgradeVotingPeriodExpired = 67,
    /// Not enough votes to pass the upgrade proposal
    UpgradeInsufficientVotes = 68,
    /// Upgrade proposal has already been executed
    UpgradeAlreadyExecuted = 69,

    // ═══════════════════════════════════════════════════════════════════════
    // Carbon Offset errors (70–75)
    // ═══════════════════════════════════════════════════════════════════════
    /// Carbon offset purchase not found
    CarbonOffsetNotFound = 70,
    /// Carbon offset program not configured for event
    CarbonOffsetNotConfigured = 71,
    /// Insufficient carbon offset credits available
    InsufficientCarbonCredits = 72,
    /// Invalid carbon footprint calculation parameters
    InvalidCarbonFootprintParams = 73,
    /// Carbon offset already purchased for this ticket/event
    CarbonOffsetAlreadyPurchased = 74,
    /// Carbon offset project not recognized
    CarbonOffsetProjectNotFound = 75,

    // ═══════════════════════════════════════════════════════════════════════
    // Identity Verification errors (76–82)
    // ═══════════════════════════════════════════════════════════════════════
    /// Identity credential not found
    IdentityCredentialNotFound = 76,
    /// Identity credential has expired
    IdentityCredentialExpired = 77,
    /// Identity credential has been revoked
    IdentityCredentialRevoked = 78,
    /// Identity provider not supported
    IdentityProviderNotSupported = 79,
    /// Identity verification failed
    IdentityVerificationFailed = 80,
    /// Identity credential already exists for this user
    IdentityCredentialAlreadyExists = 81,
    /// Invalid identity proof provided
    InvalidIdentityProof = 82,

    // ═══════════════════════════════════════════════════════════════════════
    // Cross-Chain Ticket Portability errors (83–89)
    // ═══════════════════════════════════════════════════════════════════════
    /// Cross-chain transfer not found
    CrossChainTransferNotFound = 83,
    /// Cross-chain transfer already completed
    CrossChainTransferAlreadyCompleted = 84,
    /// Cross-chain bridge transaction validation failed
    BridgeTransactionInvalid = 85,
    /// Target chain is not supported for portability
    UnsupportedTargetChain = 86,
    /// Cross-chain transfer is already in progress
    CrossChainTransferInProgress = 87,
    /// Cross-chain transfer has expired
    CrossChainTransferExpired = 88,
    /// Bridge is currently paused
    BridgePaused = 89,

    // ═══════════════════════════════════════════════════════════════════════
    // Merchandise & NFT Collectible errors (90–99)
    // ═══════════════════════════════════════════════════════════════════════
    /// Merchandise item not found
    MerchandiseNotFound = 90,
    /// Merchandise item is sold out
    MerchandiseSoldOut = 91,
    /// Merchandise item is not active
    MerchandiseNotActive = 92,
    /// NFT collectible not found
    NftNotFound = 93,
    /// NFT collectible is not transferable
    NftNotTransferable = 94,
    /// Collectible inventory not configured for event
    CollectibleInventoryNotFound = 95,
    /// Collectible max supply reached
    CollectibleMaxSupplyReached = 96,
    /// Rarity tier supply exhausted
    RarityTierExhausted = 97,
    /// Caller is not the NFT owner
    NftNotOwned = 98,

    // Dynamic Venue Space Allocation errors (100–103)
    /// Venue space allocation not found
    VenueSpaceAllocationNotFound = 100,
    /// Conflict detected during venue space allocation
    VenueSpaceAllocationConflict = 101,

    // Subscription-Based Access Passes errors (104–107)
    /// Subscription plan not found
    SubscriptionPlanNotFound = 104,
    /// Subscription is not active
    SubscriptionInactive = 105,

    // Security Monitoring errors (108–110)
    /// Security incident not found
    SecurityIncidentNotFound = 108,
}
