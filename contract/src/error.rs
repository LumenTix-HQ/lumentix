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
}
