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

    // Pricing & mint optimization (100–102)
    /// Pricing schedule multipliers or thresholds are invalid
    InvalidPricingSchedule = 100,
    /// No custom pricing schedule configured for this event
    PricingScheduleNotFound = 101,
    /// Batch mint quantity exceeds optimized limits
    BatchMintLimitExceeded = 102,
    // Dynamic Venue Space Allocation errors (114–116)
    /// Venue space allocation not found
    VenueSpaceAllocationNotFound = 114,
    /// Conflict detected during venue space allocation
    VenueSpaceAllocationConflict = 115,

    // Subscription-Based Access Passes errors (104–107)
    /// Subscription plan not found
    SubscriptionPlanNotFound = 104,
    /// Subscription is not active
    SubscriptionInactive = 105,

    // Security Monitoring errors (108–110)
    /// Security incident not found
    SecurityIncidentNotFound = 108,
    /// Ticket transfers are currently locked by an organizer-defined blackout window
    TransferBlackoutActive = 109,
    /// Referral link code is already claimed by another referrer
    ReferralLinkAlreadyExists = 110,
    /// Referral link does not exist for the requested event
    ReferralLinkNotFound = 111,
    /// Referral purchase has already been processed for this buyer
    ReferralPurchaseAlreadyProcessed = 112,
    /// Referrers cannot refer themselves
    SelfReferralNotAllowed = 113,

    // ═══════════════════════════════════════════════════════════════════════
    // DID Ticket Linking errors (26–28)
    // ═══════════════════════════════════════════════════════════════════════
    /// A DID credential is already linked to this ticket
    TicketDidAlreadyLinked = 26,
    /// No DID link exists for this ticket
    TicketDidLinkNotFound = 27,
    /// DID credential verification failed during ticket scanning
    DidCredentialVerificationFailed = 28,

    // ═══════════════════════════════════════════════════════════════════════
    // Resale Price Ceiling errors (33–34)
    // ═══════════════════════════════════════════════════════════════════════
    /// Proposed resale price exceeds the configured ceiling
    ResalePriceExceedsCeiling = 33,
    /// No price ceiling configured for this event
    PriceCeilingNotFound = 34,

    // ═══════════════════════════════════════════════════════════════════════
    // Attendance Memorabilia errors (42, 99, 103)
    // ═══════════════════════════════════════════════════════════════════════
    /// Memorabilia NFT has already been claimed for this ticket
    MemorabiliaAlreadyClaimed = 42,
    /// Event check-in proof is invalid or ticket was never used
    CheckinProofInvalid = 99,
    /// Memorabilia claim not found
    MemorabiliaClaimNotFound = 103,

    // ═══════════════════════════════════════════════════════════════════════
    // Email Campaign errors (116–121)
    // ═══════════════════════════════════════════════════════════════════════
    /// Email campaign not found
    EmailCampaignNotFound = 116,
    /// Email campaign subject or body is empty
    EmailCampaignInvalidContent = 117,
    /// Email campaign has already been sent and cannot be modified
    EmailCampaignAlreadySent = 118,
    /// Caller is not the campaign organizer
    EmailCampaignUnauthorized = 119,
    /// Campaign analytics record not found
    EmailCampaignAnalyticsNotFound = 120,
    /// Delivery count exceeds the number of recipients
    EmailCampaignInvalidDeliveryCount = 121,

    // ═══════════════════════════════════════════════════════════════════════
    // Tax Determination errors (122–130)
    // ═══════════════════════════════════════════════════════════════════════
    /// Tax rule with the specified ID does not exist
    TaxRuleNotFound = 122,
    /// Tax jurisdiction code is empty or invalid
    TaxInvalidJurisdiction = 123,
    /// Tax rate basis points exceed 10 000 (100%)
    TaxInvalidRate = 124,
    /// Tax collection record not found
    TaxCollectionRecordNotFound = 125,
    /// Tax report not found
    TaxReportNotFound = 126,
    /// No tax collection records exist for the requested jurisdiction/period
    TaxNoRecordsForJurisdiction = 127,
    /// Period start must be strictly before period end
    TaxInvalidPeriod = 128,
    /// Tax rule already exists for this jurisdiction code
    TaxRuleAlreadyExists = 129,
    /// Ticket base price must be positive to compute tax
    TaxInvalidBasePrice = 130,
    // Core feature implementation errors
    // ═══════════════════════════════════════════════════════════════════════
    /// The provided zero-knowledge proof is invalid
    InvalidZkp = 150,
    /// Staff member doesn't have the required role/permission
    StaffRoleNotFound = 151,

    // ═══════════════════════════════════════════════════════════════════════
    // Event Certification errors (Issue #654)
    // ═══════════════════════════════════════════════════════════════════════
    /// The requested certification standard has not been enabled by the platform admin
    CertificationStandardNotFound = 200,
    /// No certificate exists with the given ID
    CertificateNotFound = 201,

    // ═══════════════════════════════════════════════════════════════════════
    // Predictive Analytics errors (Issue #646)
    // ═══════════════════════════════════════════════════════════════════════
    /// Not enough historical sales data points were provided to produce a forecast
    InsufficientSalesHistory = 202,

    // ═══════════════════════════════════════════════════════════════════════
    // Anonymous Event Feedback Survey errors (203–206)
    // ═══════════════════════════════════════════════════════════════════════
    /// This ticket has already submitted a survey response for this event
    SurveyAlreadySubmitted = 203,
    /// No survey responses exist yet for this event
    NoSurveyResponses = 204,
    /// Survey submission must include at least one rating
    EmptySurveyAnswers = 205,
    /// Every survey rating must be between 1 and 5
    InvalidSurveyRating = 206,

    // ═══════════════════════════════════════════════════════════════════════
    // Decentralized Schedule Voting errors (207–213)
    // ═══════════════════════════════════════════════════════════════════════
    /// A schedule vote needs at least two candidates to be meaningful
    InsufficientScheduleCandidates = 207,
    /// Schedule vote with the given ID does not exist
    ScheduleVoteNotFound = 208,
    /// Voting deadline for this schedule vote has passed
    ScheduleVotingClosed = 209,
    /// Schedule vote cannot be tallied before its voting deadline
    ScheduleVotingStillActive = 210,
    /// This ticket holder has already voted on this schedule slot
    ScheduleVoteAlreadyCast = 211,
    /// Caller does not hold a ticket for the event being voted on
    ScheduleVoterNotTicketHolder = 212,
    /// Candidate index is out of range for this schedule vote
    InvalidScheduleCandidateIndex = 213,

    // ═══════════════════════════════════════════════════════════════════════
    // Promo Code errors (214–220)
    // ═══════════════════════════════════════════════════════════════════════
    /// Promo code does not exist for this event
    PromoCodeNotFound = 214,
    /// A promo code with this name already exists for this event
    PromoCodeAlreadyExists = 215,
    /// Promo code's expiration date has passed
    PromoCodeExpired = 216,
    /// Promo code has been deactivated by the organizer
    PromoCodeInactive = 217,
    /// Promo code has reached its maximum total number of uses
    PromoCodeGlobalLimitReached = 218,
    /// Caller has already used this promo code the maximum number of times
    PromoCodeUserLimitReached = 219,
    /// Discount basis points must be between 1 and 10000
    InvalidPromoDiscount = 220,
    // ═══════════════════════════════════════════════════════════════════════
    // WalletConnect session errors (221–227)
    // ═══════════════════════════════════════════════════════════════════════
    /// No wallet session exists with this id
    WalletSessionNotFound = 221,
    /// Session has already been approved and cannot be approved again
    WalletSessionAlreadyApproved = 222,
    /// Session's expiry timestamp has passed
    WalletSessionExpired = 223,
    /// Session is not in the pending state required for this operation
    WalletSessionNotPending = 224,
    /// Session has been disconnected and can no longer be used
    WalletSessionDisconnected = 225,
    /// Requested session time-to-live is outside the permitted range
    InvalidSessionTtl = 226,

    // ═══════════════════════════════════════════════════════════════════════
    // Offline validation errors (228–234)
    // ═══════════════════════════════════════════════════════════════════════
    /// No cached validation proof exists for this ticket
    ValidationProofNotFound = 228,
    /// Cached validation proof is past its validity window
    ValidationProofExpired = 229,
    /// Supplied proof hash does not match the cached proof
    ValidationProofMismatch = 230,
    /// This offline scan has already been synced
    OfflineScanAlreadySynced = 231,
    /// Too many entries supplied in a single offline batch
    OfflineBatchTooLarge = 232,
    /// Scan timestamp falls outside the proof's validity window
    OfflineScanOutsideWindow = 233,
    /// Requested proof validity window is zero or exceeds the permitted maximum
    InvalidProofValidityWindow = 234,
}
