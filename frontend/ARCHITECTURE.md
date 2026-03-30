# Wallet Integration Architecture

## Component Hierarchy

```
App
└── WalletProvider (Context)
    ├── Navigation
    │   ├── NetworkSwitcher
    │   └── WalletButton
    └── Pages
        └── Components using useWallet()
```

## Data Flow

```
User Action
    ↓
WalletButton/Component
    ↓
useWallet() / useWalletConnection()
    ↓
WalletContext
    ↓
Freighter Integration (lib/stellar/freighter.ts)
    ↓
Freighter Extension
    ↓
Stellar Network
```

## State Management

```
WalletContext
├── State
│   ├── isConnected: boolean
│   ├── publicKey: string | null
│   ├── walletType: WalletType | null
│   ├── network: NetworkType
│   ├── isLoading: boolean
│   └── error: string | null
└── Actions
    ├── connect(walletType)
    ├── disconnect()
    └── switchNetwork(network)
```

## Storage Layer

```
localStorage
└── lumentix_wallet
    ├── walletType: 'freighter'
    ├── publicKey: 'GXXX...'
    └── network: 'testnet' | 'mainnet'
```

## Module Dependencies

```
Components
    ↓ import
Hooks (useWallet, useWalletConnection)
    ↓ import
Context (WalletContext)
    ↓ import
Lib (freighter.ts, wallet-utils.ts)
    ↓ import
Types (wallet.ts)
```

## Connection Flow

### Initial Connection

```
1. User clicks "Connect Wallet"
2. WalletButton calls connectWallet(FREIGHTER)
3. useWalletConnection updates state (isConnecting: true)
4. WalletContext.connect() called
5. connectFreighter() checks for extension
6. Freighter popup appears
7. User approves connection
8. Public key retrieved
9. Network validated
10. State updated (isConnected: true, publicKey: 'G...')
11. Data saved to localStorage
12. UI updates to show connected state
```

### Reconnection on Page Load

```
1. App mounts
2. WalletProvider useEffect runs
3. getStoredWalletData() reads localStorage
4. If data exists, attempt reconnection
5. connectFreighter() validates connection
6. If successful, restore state
7. If failed, clear storage and reset state
```

### Network Switching

```
1. User clicks network toggle
2. NetworkSwitcher calls switchNetwork(newNetwork)
3. WalletContext validates current connection
4. connectFreighter(newNetwork) called
5. Freighter validates network
6. If mismatch, error shown
7. User switches network in Freighter
8. Retry connection
9. Update state and storage
10. UI reflects new network
```

### Disconnection

```
1. User clicks "Disconnect"
2. WalletButton calls disconnectWallet()
3. WalletContext.disconnect() called
4. clearWalletData() removes localStorage
5. State reset to initial values
6. UI updates to disconnected state
```

## Error Handling Flow

```
Operation Attempt
    ↓
Try Block
    ↓
Error Occurs
    ↓
Catch Block
    ├── FreighterError → User-friendly message
    ├── Network Error → Network-specific message
    └── Unknown Error → Generic fallback message
    ↓
Update State (error: message)
    ↓
UI displays error notification
    ↓
User can dismiss or retry
```

## Transaction Flow (Example)

```
1. User initiates payment
2. Component uses TransactionHelper
3. buildPaymentTransaction() creates transaction
4. signAndSubmitWithFreighter() called
5. Transaction XDR generated
6. signTransactionWithFreighter() requests signature
7. Freighter popup shows transaction details
8. User approves
9. Signed XDR returned
10. Transaction submitted to Horizon
11. Response returned to component
12. UI shows success/error
```

## Security Model

```
Private Keys
    ↓ (never leave)
Freighter Extension
    ↓ (signs transactions)
Signed Transactions
    ↓ (sent to app)
Application
    ↓ (submits to network)
Stellar Network
```

## Type System

```
wallet.ts (types)
    ├── WalletType enum
    ├── NetworkType enum
    ├── WalletState interface
    ├── WalletContextType interface
    └── FreighterAPI interface
        ↓ (used by)
All Components & Utilities
```

## Extension Points

### Adding New Wallet (e.g., LOBSTR)

```
1. Create lib/stellar/lobstr.ts
2. Implement connectLobstr() function
3. Add LOBSTR case to WalletContext.connect()
4. Enable LOBSTR button in WalletButton
5. Update types if needed
```

### Adding Transaction Types

```
1. Add method to TransactionHelper
2. Create specific DTO/interface
3. Use in component
4. Sign with signTransactionWithFreighter()
5. Submit to network
```

## Performance Considerations

- **Lazy Loading**: Freighter detection waits up to 3s
- **State Persistence**: localStorage for instant reconnection
- **Memoization**: Context value memoized with useCallback
- **Error Recovery**: Graceful degradation on failures

## Testing Strategy

```
Unit Tests
├── wallet-utils.ts functions
├── freighter.ts connection logic
└── TransactionHelper methods

Integration Tests
├── WalletContext state management
├── Component interactions
└── Storage persistence

E2E Tests
├── Full connection flow
├── Network switching
├── Transaction signing
└── Error scenarios
```

## Deployment Checklist

- [ ] Environment variables configured
- [ ] Network endpoints correct
- [ ] Error tracking enabled
- [ ] Analytics integrated
- [ ] Documentation updated
- [ ] Tests passing
- [ ] Security audit completed
