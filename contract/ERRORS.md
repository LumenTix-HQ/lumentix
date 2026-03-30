# Lumentix Contract Error Reference

This document provides detailed information about all error types in the Lumentix smart contract.

## Error Codes

### 1. NotInitialized

**Code**: 1  
**Description**: The contract has not been initialized yet.

**When it occurs**:
- Any function is called before `initialize()` is executed

**Resolution**:
- Call `initialize()` with a valid admin address first

**Example**:
```rust
// This will fail if contract not initialized
let event = contract.create_event(...); // Returns NotInitialized
```

---

### 2. AlreadyInitialized

**Code**: 2  
**Description**: The contract has already been initialized.

**When it occurs**:
- `initialize()` is called more than once

**Resolution**:
- Contract can only be initialized once. No action needed if already initialized.

**Example**:
```rust
contract.initialize(&admin); // Success
contract.initialize(&admin); // Returns AlreadyInitialized
```

---

### 3. Unauthorized

**Code**: 3  
**Description**: The caller is not authorized to perform this action.

**When it occurs**:
- Non-organizer tries to cancel/complete an event
- Non-organizer tries to validate a ticket
- Non-owner tries to refund a ticket
- Non-organizer tries to release escrow

**Resolution**:
- Ensure the correct address is calling the function
- Only organizers can manage their events
- Only ticket owners can request refunds

**Example**:
```rust
// Only organizer can cancel
contract.cancel_event(&wrong_address, event_id); // Returns Unauthorized
```

---

### 4. EventNotFound

**Code**: 4  
**Description**: The specified event ID does not exist.

**When it occurs**:
- Querying or operating on a non-existent event ID

**Resolution**:
- Verify the event ID exists
- Use valid event IDs returned from `create_event()`

**Example**:
```rust
let event = contract.get_event(&999); // Returns EventNotFound if doesn't exist
```

---

### 5. TicketNotFound

**Code**: 5  
**Description**: The specified ticket ID does not exist.

**When it occurs**:
- Querying or operating on a non-existent ticket ID

**Resolution**:
- Verify the ticket ID exists
- Use valid ticket IDs returned from `purchase_ticket()`

**Example**:
```rust
let ticket = contract.get_ticket(&999); // Returns TicketNotFound if doesn't exist
```

---

### 6. EventSoldOut

**Code**: 6  
**Description**: The event has reached maximum ticket capacity.

**When it occurs**:
- Attempting to purchase a ticket when `tickets_sold >= max_tickets`

**Resolution**:
- Event is at capacity, no more tickets available
- Wait for cancellations or choose another event

**Example**:
```rust
// Event with max_tickets = 1
contract.purchase_ticket(&buyer1, event_id, 100); // Success
contract.purchase_ticket(&buyer2, event_id, 100); // Returns EventSoldOut
```

---

### 7. TicketAlreadyUsed

**Code**: 7  
**Description**: The ticket has already been validated/used.

**When it occurs**:
- Attempting to use a ticket that's already marked as used
- Attempting to refund a used ticket

**Resolution**:
- Ticket cannot be reused or refunded after validation
- Each ticket can only be used once

**Example**:
```rust
contract.use_ticket(&ticket_id, &organizer); // Success
contract.use_ticket(&ticket_id, &organizer); // Returns TicketAlreadyUsed
```

---

### 8. InvalidStatusTransition

**Code**: 8  
**Description**: The requested status change is not allowed.

**When it occurs**:
- Purchasing ticket for non-active event
- Cancelling already cancelled/completed event
- Completing non-active event
- Completing event before end time

**Resolution**:
- Check event status before operations
- Follow valid state transitions: Active → Cancelled or Active → Completed

**Example**:
```rust
contract.cancel_event(&organizer, event_id); // Active → Cancelled
contract.cancel_event(&organizer, event_id); // Returns InvalidStatusTransition
```

---

### 9. InsufficientFunds

**Code**: 9  
**Description**: Payment amount is less than required.

**When it occurs**:
- `payment_amount < ticket_price` when purchasing ticket

**Resolution**:
- Provide payment amount >= ticket price

**Example**:
```rust
// Ticket price is 100
contract.purchase_ticket(&buyer, event_id, 50); // Returns InsufficientFunds
contract.purchase_ticket(&buyer, event_id, 100); // Success
```

---

### 10. RefundNotAllowed

**Code**: 10  
**Description**: Refund is not permitted for this ticket.

**When it occurs**:
- Attempting to refund an already refunded ticket
- Attempting to refund a used ticket

**Resolution**:
- Tickets can only be refunded once
- Used tickets cannot be refunded

**Example**:
```rust
contract.refund_ticket(&ticket_id, &buyer); // Success
contract.refund_ticket(&ticket_id, &buyer); // Returns RefundNotAllowed
```

---

### 11. EventNotCancelled

**Code**: 11  
**Description**: The event must be cancelled before this operation.

**When it occurs**:
- Attempting to refund a ticket for an active or completed event

**Resolution**:
- Organizer must cancel the event first
- Refunds only available for cancelled events

**Example**:
```rust
// Event is still active
contract.refund_ticket(&ticket_id, &buyer); // Returns EventNotCancelled

// After cancellation
contract.cancel_event(&organizer, event_id);
contract.refund_ticket(&ticket_id, &buyer); // Success
```

---

### 12. EscrowAlreadyReleased

**Code**: 12  
**Description**: Escrow funds have already been released.

**When it occurs**:
- Attempting to release escrow when balance is 0

**Resolution**:
- Escrow can only be released once per event
- Check escrow balance before attempting release

**Example**:
```rust
contract.release_escrow(&organizer, event_id); // Success, returns amount
contract.release_escrow(&organizer, event_id); // Returns EscrowAlreadyReleased
```

---

### 13. InvalidAmount

**Code**: 13  
**Description**: Amount must be greater than zero.

**When it occurs**:
- Creating event with `ticket_price <= 0`
- Purchasing ticket with `payment_amount <= 0`

**Resolution**:
- Provide positive amounts (> 0)

**Example**:
```rust
contract.create_event(..., ticket_price: 0, ...); // Returns InvalidAmount
contract.create_event(..., ticket_price: 100, ...); // Success
```

---

### 14. CapacityExceeded

**Code**: 14  
**Description**: Capacity must be greater than zero.

**When it occurs**:
- Creating event with `max_tickets = 0`

**Resolution**:
- Provide positive capacity (> 0)

**Example**:
```rust
contract.create_event(..., max_tickets: 0); // Returns CapacityExceeded
contract.create_event(..., max_tickets: 50); // Success
```

---

### 15. InvalidTimeRange

**Code**: 15  
**Description**: Start time must be before end time.

**When it occurs**:
- Creating event with `start_time >= end_time`

**Resolution**:
- Ensure `start_time < end_time`

**Example**:
```rust
contract.create_event(..., start_time: 2000, end_time: 1000); // Returns InvalidTimeRange
contract.create_event(..., start_time: 1000, end_time: 2000); // Success
```

---

### 16. EmptyString

**Code**: 16  
**Description**: String field cannot be empty.

**When it occurs**:
- Creating event with empty name

**Resolution**:
- Provide non-empty strings for required fields

**Example**:
```rust
contract.create_event(..., name: "", ...); // Returns EmptyString
contract.create_event(..., name: "Concert", ...); // Success
```

---

### 17. InvalidAddress

**Code**: 17  
**Description**: Invalid address provided.

**When it occurs**:
- Currently reserved for future custom address validation

**Resolution**:
- Ensure valid Stellar addresses are used

---

### 18. InsufficientEscrow

**Code**: 18  
**Description**: Escrow balance is insufficient for the operation.

**When it occurs**:
- Attempting to deduct more from escrow than available

**Resolution**:
- This is an internal error that shouldn't occur in normal operation
- Contact support if encountered

---

## Error Handling Best Practices

### 1. Always Check Return Values

```rust
match contract.create_event(...) {
    Ok(event_id) => {
        // Handle success
    },
    Err(e) => {
        // Handle specific error
        match e {
            LumentixError::InvalidAmount => { /* ... */ },
            LumentixError::InvalidTimeRange => { /* ... */ },
            _ => { /* ... */ }
        }
    }
}
```

### 2. Validate Before Calling

```rust
// Check conditions before calling contract
if payment_amount >= ticket_price {
    contract.purchase_ticket(&buyer, event_id, payment_amount);
}
```

### 3. Handle Common Errors

Most common errors to handle:
- `NotInitialized`: Initialize contract first
- `Unauthorized`: Check caller permissions
- `InsufficientFunds`: Verify payment amount
- `EventSoldOut`: Check availability first
- `InvalidAmount`: Validate positive amounts

### 4. User-Friendly Messages

Map error codes to user-friendly messages:

```rust
fn error_message(error: LumentixError) -> &'static str {
    match error {
        LumentixError::EventSoldOut => "Sorry, this event is sold out",
        LumentixError::InsufficientFunds => "Payment amount is too low",
        LumentixError::Unauthorized => "You don't have permission for this action",
        // ... etc
    }
}
```

## Debugging Tips

1. **Check initialization**: Most operations require initialized contract
2. **Verify addresses**: Ensure correct addresses for authorization
3. **Validate inputs**: Check amounts, capacities, and time ranges before calling
4. **Check event status**: Some operations only work with specific statuses
5. **Monitor escrow**: Track escrow balance for payment operations
