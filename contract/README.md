# Lumentix Soroban Smart Contract

A comprehensive ticketing and event management smart contract built on Stellar's Soroban platform.

## Features

- **Event Management**: Create, cancel, and complete events
- **Ticket Sales**: Purchase and validate tickets with escrow protection
- **Refund System**: Automatic refunds for cancelled events
- **Escrow Protection**: Funds held in escrow until event completion
- **Comprehensive Error Handling**: Clear error types for debugging
- **Input Validation**: All inputs validated before processing

## Error Handling

The contract uses a comprehensive `LumentixError` enum with 18 distinct error types:

| Error Code | Error Name | Description |
|------------|------------|-------------|
| 1 | NotInitialized | Contract not initialized |
| 2 | AlreadyInitialized | Contract already initialized |
| 3 | Unauthorized | Caller not authorized |
| 4 | EventNotFound | Event ID doesn't exist |
| 5 | TicketNotFound | Ticket ID doesn't exist |
| 6 | EventSoldOut | Maximum capacity reached |
| 7 | TicketAlreadyUsed | Ticket already validated |
| 8 | InvalidStatusTransition | Invalid state change |
| 9 | InsufficientFunds | Payment too low |
| 10 | RefundNotAllowed | Refund not permitted |
| 11 | EventNotCancelled | Event must be cancelled first |
| 12 | EscrowAlreadyReleased | Funds already released |
| 13 | InvalidAmount | Amount must be > 0 |
| 14 | CapacityExceeded | Capacity must be > 0 |
| 15 | InvalidTimeRange | Start must be before end |
| 16 | EmptyString | String cannot be empty |
| 17 | InvalidAddress | Invalid address provided |
| 18 | InsufficientEscrow | Escrow balance too low |

## Input Validation

All contract functions validate inputs before processing:

- **Amounts**: Must be positive (> 0)
- **Capacity**: Must be positive (> 0)
- **Time Ranges**: Start time must be before end time
- **Strings**: Cannot be empty
- **Addresses**: Validated by Soroban SDK

## Contract Functions

### Initialization

```rust
initialize(admin: Address) -> Result<(), LumentixError>
```

Initialize the contract with an admin address. Can only be called once.

### Event Management

```rust
create_event(
    organizer: Address,
    name: String,
    description: String,
    location: String,
    start_time: u64,
    end_time: u64,
    ticket_price: i128,
    max_tickets: u32,
) -> Result<u64, LumentixError>
```

Create a new event. Returns the event ID.

**Validations**:
- Price must be > 0
- Capacity must be > 0
- Start time < end time
- Name cannot be empty

```rust
cancel_event(organizer: Address, event_id: u64) -> Result<(), LumentixError>
```

Cancel an event. Only the organizer can cancel. Enables refunds.

```rust
complete_event(organizer: Address, event_id: u64) -> Result<(), LumentixError>
```

Mark an event as completed after the end time. Required before releasing escrow.

### Ticket Management

```rust
purchase_ticket(
    buyer: Address,
    event_id: u64,
    payment_amount: i128,
) -> Result<u64, LumentixError>
```

Purchase a ticket for an event. Returns the ticket ID.

**Validations**:
- Event must be active
- Event not sold out
- Payment >= ticket price

```rust
use_ticket(ticket_id: u64, validator: Address) -> Result<(), LumentixError>
```

Mark a ticket as used. Only the event organizer can validate tickets.

```rust
refund_ticket(ticket_id: u64, buyer: Address) -> Result<(), LumentixError>
```

Request a refund for a ticket. Only available if event is cancelled.

### Escrow Management

```rust
release_escrow(organizer: Address, event_id: u64) -> Result<i128, LumentixError>
```

Release escrow funds to the organizer. Only available after event completion.

### Query Functions

```rust
get_event(event_id: u64) -> Result<Event, LumentixError>
get_ticket(ticket_id: u64) -> Result<Ticket, LumentixError>
get_admin() -> Result<Address, LumentixError>
```

## Building

```bash
cargo build --target wasm32-unknown-unknown --release
```

## Testing

```bash
cargo test
```

## Deployment

1. Build the contract:
```bash
soroban contract build
```

2. Deploy to testnet:
```bash
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/lumentix_contract.wasm \
  --source <YOUR_SECRET_KEY> \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"
```

3. Initialize the contract:
```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source <YOUR_SECRET_KEY> \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015" \
  -- initialize \
  --admin <ADMIN_ADDRESS>
```

## Security Considerations

1. **Authorization**: All state-changing functions require caller authentication
2. **Validation**: All inputs validated before processing
3. **Escrow**: Funds held securely until event completion or cancellation
4. **Error Handling**: No panic! calls - all errors returned explicitly
5. **State Transitions**: Strict validation of status changes

## License

MIT
