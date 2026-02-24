# Lumentix Contract Usage Examples

This document provides practical examples of using the Lumentix smart contract.

## Setup

```bash
# Install dependencies
make install

# Build the contract
make build

# Run tests
make test
```

## Example 1: Basic Event Creation and Ticket Purchase

```rust
use soroban_sdk::{Env, Address, String};

// Initialize contract
let admin = Address::generate(&env);
contract.initialize(&admin);

// Create an event
let organizer = Address::generate(&env);
let event_id = contract.create_event(
    &organizer,
    &String::from_str(&env, "Summer Music Festival"),
    &String::from_str(&env, "Annual outdoor music festival"),
    &String::from_str(&env, "Central Park, NYC"),
    &1704067200u64,  // Start: Jan 1, 2024
    &1704153600u64,  // End: Jan 2, 2024
    &5000000i128,    // Price: 50 XLM (in stroops)
    &1000u32,        // Max 1000 tickets
);

// Purchase a ticket
let buyer = Address::generate(&env);
let ticket_id = contract.purchase_ticket(
    &buyer,
    &event_id,
    &5000000i128,  // Payment: 50 XLM
);

println!("Event created with ID: {}", event_id);
println!("Ticket purchased with ID: {}", ticket_id);
```

## Example 2: Ticket Validation at Event

```rust
// At the event entrance, organizer validates ticket
let result = contract.use_ticket(&ticket_id, &organizer);

match result {
    Ok(_) => println!("Ticket validated successfully!"),
    Err(LumentixError::TicketAlreadyUsed) => {
        println!("Error: This ticket has already been used");
    },
    Err(LumentixError::Unauthorized) => {
        println!("Error: Only the event organizer can validate tickets");
    },
    Err(e) => println!("Error: {:?}", e),
}
```

## Example 3: Event Cancellation and Refunds

```rust
// Organizer cancels the event
contract.cancel_event(&organizer, &event_id)
    .expect("Failed to cancel event");

// Ticket holders request refunds
let refund_result = contract.refund_ticket(&ticket_id, &buyer);

match refund_result {
    Ok(_) => println!("Refund processed successfully"),
    Err(LumentixError::EventNotCancelled) => {
        println!("Event must be cancelled before refunds");
    },
    Err(LumentixError::TicketAlreadyUsed) => {
        println!("Used tickets cannot be refunded");
    },
    Err(e) => println!("Refund failed: {:?}", e),
}
```

## Example 4: Event Completion and Escrow Release

```rust
// After event ends, organizer marks it as completed
contract.complete_event(&organizer, &event_id)
    .expect("Failed to complete event");

// Release escrow funds to organizer
let escrow_amount = contract.release_escrow(&organizer, &event_id)
    .expect("Failed to release escrow");

println!("Released {} stroops to organizer", escrow_amount);
```

## Example 5: Error Handling

```rust
// Comprehensive error handling example
fn purchase_ticket_safe(
    contract: &LumentixContractClient,
    buyer: &Address,
    event_id: u64,
    payment: i128,
) -> Result<u64, String> {
    match contract.try_purchase_ticket(buyer, &event_id, &payment) {
        Ok(ticket_id) => Ok(ticket_id),
        Err(Ok(LumentixError::EventNotFound)) => {
            Err("Event does not exist".to_string())
        },
        Err(Ok(LumentixError::EventSoldOut)) => {
            Err("Sorry, this event is sold out".to_string())
        },
        Err(Ok(LumentixError::InsufficientFunds)) => {
            Err("Payment amount is too low".to_string())
        },
        Err(Ok(LumentixError::InvalidStatusTransition)) => {
            Err("Event is not active".to_string())
        },
        Err(e) => Err(format!("Unexpected error: {:?}", e)),
    }
}
```

## Example 6: Input Validation

```rust
// Validate inputs before creating event
fn create_event_with_validation(
    contract: &LumentixContractClient,
    organizer: &Address,
    name: &str,
    price: i128,
    capacity: u32,
    start: u64,
    end: u64,
) -> Result<u64, String> {
    // Validate price
    if price <= 0 {
        return Err("Price must be positive".to_string());
    }
    
    // Validate capacity
    if capacity == 0 {
        return Err("Capacity must be greater than zero".to_string());
    }
    
    // Validate time range
    if start >= end {
        return Err("Start time must be before end time".to_string());
    }
    
    // Validate name
    if name.is_empty() {
        return Err("Event name cannot be empty".to_string());
    }
    
    // Create event
    match contract.try_create_event(
        organizer,
        &String::from_str(&env, name),
        &String::from_str(&env, "Description"),
        &String::from_str(&env, "Location"),
        &start,
        &end,
        &price,
        &capacity,
    ) {
        Ok(event_id) => Ok(event_id),
        Err(e) => Err(format!("Failed to create event: {:?}", e)),
    }
}
```

## Example 7: Query Event and Ticket Information

```rust
// Get event details
let event = contract.get_event(&event_id)
    .expect("Event not found");

println!("Event: {}", event.name);
println!("Organizer: {}", event.organizer);
println!("Price: {} stroops", event.ticket_price);
println!("Tickets sold: {}/{}", event.tickets_sold, event.max_tickets);
println!("Status: {:?}", event.status);

// Get ticket details
let ticket = contract.get_ticket(&ticket_id)
    .expect("Ticket not found");

println!("Ticket owner: {}", ticket.owner);
println!("Event ID: {}", ticket.event_id);
println!("Used: {}", ticket.used);
println!("Refunded: {}", ticket.refunded);
```

## Example 8: Multiple Ticket Purchases

```rust
// Purchase multiple tickets for the same event
let mut ticket_ids = Vec::new();

for i in 0..5 {
    let buyer = Address::generate(&env);
    
    match contract.try_purchase_ticket(&buyer, &event_id, &5000000i128) {
        Ok(ticket_id) => {
            ticket_ids.push(ticket_id);
            println!("Ticket {} purchased: ID {}", i + 1, ticket_id);
        },
        Err(Ok(LumentixError::EventSoldOut)) => {
            println!("Event sold out after {} tickets", i);
            break;
        },
        Err(e) => {
            println!("Purchase failed: {:?}", e);
            break;
        }
    }
}

println!("Total tickets purchased: {}", ticket_ids.len());
```

## Example 9: Check Availability Before Purchase

```rust
// Check if tickets are available
fn check_availability(
    contract: &LumentixContractClient,
    event_id: u64,
) -> Result<u32, String> {
    let event = contract.get_event(&event_id)
        .map_err(|_| "Event not found".to_string())?;
    
    if event.status != EventStatus::Active {
        return Err("Event is not active".to_string());
    }
    
    let available = event.max_tickets - event.tickets_sold;
    Ok(available)
}

// Use it before purchase
match check_availability(&contract, event_id) {
    Ok(available) if available > 0 => {
        println!("{} tickets available", available);
        // Proceed with purchase
        contract.purchase_ticket(&buyer, &event_id, &payment);
    },
    Ok(_) => println!("Event is sold out"),
    Err(e) => println!("Error: {}", e),
}
```

## Example 10: CLI Integration

```bash
# Deploy contract
make deploy-testnet

# Save contract ID
export CONTRACT_ID="CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
export ADMIN_ADDRESS="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

# Initialize
make initialize

# Create an event
soroban contract invoke \
  --id $CONTRACT_ID \
  --source $SOROBAN_SECRET_KEY \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015" \
  -- create_event \
  --organizer $ORGANIZER_ADDRESS \
  --name "Concert" \
  --description "Live music event" \
  --location "Stadium" \
  --start_time 1704067200 \
  --end_time 1704153600 \
  --ticket_price 5000000 \
  --max_tickets 1000

# Purchase ticket
soroban contract invoke \
  --id $CONTRACT_ID \
  --source $BUYER_SECRET_KEY \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015" \
  -- purchase_ticket \
  --buyer $BUYER_ADDRESS \
  --event_id 1 \
  --payment_amount 5000000

# Get event info
soroban contract invoke \
  --id $CONTRACT_ID \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015" \
  -- get_event \
  --event_id 1
```

## Best Practices

1. **Always validate inputs** before calling contract functions
2. **Handle all error cases** explicitly
3. **Check event status** before operations
4. **Verify authorization** before state-changing operations
5. **Use try_* methods** for better error handling
6. **Check availability** before purchasing tickets
7. **Store contract responses** (event IDs, ticket IDs) securely
8. **Monitor escrow balances** for financial operations
9. **Test thoroughly** on testnet before mainnet deployment
10. **Implement retry logic** for network failures

## Common Patterns

### Pattern 1: Safe Purchase Flow

```rust
// 1. Check event exists and is active
// 2. Check availability
// 3. Validate payment amount
// 4. Purchase ticket
// 5. Store ticket ID
```

### Pattern 2: Event Lifecycle

```rust
// 1. Create event (Active)
// 2. Sell tickets
// 3. Validate tickets at event
// 4. Complete event (Completed)
// 5. Release escrow
```

### Pattern 3: Cancellation Flow

```rust
// 1. Cancel event (Cancelled)
// 2. Notify ticket holders
// 3. Process refunds
// 4. Verify escrow balance
```

## Testing

Run the comprehensive test suite:

```bash
# Run all tests
make test

# Run with verbose output
make test-verbose

# Run specific test
cargo test test_purchase_ticket_success -- --nocapture
```

## Troubleshooting

### Issue: "NotInitialized" error
**Solution**: Call `initialize()` first

### Issue: "Unauthorized" error
**Solution**: Ensure correct address is calling the function

### Issue: "InsufficientFunds" error
**Solution**: Increase payment amount to at least ticket price

### Issue: "EventSoldOut" error
**Solution**: Event is at capacity, no action possible

### Issue: "InvalidAmount" error
**Solution**: Ensure all amounts are positive (> 0)

## Additional Resources

- [Soroban Documentation](https://soroban.stellar.org/)
- [Stellar SDK](https://github.com/stellar/js-stellar-sdk)
- [Contract Error Reference](./ERRORS.md)
- [Main README](./README.md)
