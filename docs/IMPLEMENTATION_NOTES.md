# Implementation Notes for Multi-Issue Features

This document outlines the implementation of four major features for LumenTix.

## Issue #957: Comprehensive API Reference Documentation

**Status**: ✅ Completed  
**Files Created**: `docs/API_ENDPOINTS.md`

### Summary
Created comprehensive API reference documentation covering:
- Authentication methods (JWT, wallet, OAuth)
- All major endpoints (Events, Tickets, Registrations, Marketplace, Pass Packages, Fraud Detection)
- Request/response examples for each endpoint
- Error handling and status codes
- Rate limiting information
- WebHook events and subscriptions
- Integration examples (cURL, Python, JavaScript)
- Best practices and support resources

### Key Sections
1. **Authentication**: Covers JWT, wallet-based, and Google OAuth flows
2. **Events API**: CRUD operations for events
3. **Tickets API**: Purchase, transfer, and management
4. **Registrations**: Event registration and check-in
5. **Resale Marketplace**: Listing and buying resale tickets
6. **Pass Packages**: Cross-event pass purchases and management
7. **Fraud Detection**: Real-time fraud analytics
8. **Error Responses**: Standardized error format
9. **WebHooks**: Event subscription system

### Integration Points
- No database migrations required
- No new dependencies
- Standalone documentation file
- Can be served via `/docs` endpoint or integrated with Swagger

---

## Issue #958: Multi-Factor Authentication for Organizers

**Status**: ✅ Completed  
**Files Created**:
- `backend/src/users/entities/user.entity.ts` (modified)
- `backend/src/auth/mfa/mfa.service.ts`
- `backend/src/auth/mfa/mfa.controller.ts`
- `backend/src/auth/mfa/mfa.module.ts`

### Summary
Implemented comprehensive MFA system supporting both TOTP and SMS methods.

### Database Schema Changes
User entity extended with:
- `mfaConfig`: JSONB object storing MFA configuration
  - `enabled`: Boolean flag for MFA activation
  - `method`: 'totp' | 'sms'
  - `totpSecret`: Base32-encoded TOTP secret
  - `phoneNumber`: SMS destination (encrypted in production)
  - `backupCodes`: Array of recovery codes
  - `verifiedAt`: Timestamp of last verification
  
- `mfaSessions`: Array of active MFA sessions for audit trail

### API Endpoints

#### MFA Setup
- `POST /auth/mfa/enable-totp/init` - Initialize TOTP setup (returns QR code)
- `POST /auth/mfa/enable-totp/verify` - Verify TOTP token and enable
- `POST /auth/mfa/enable-sms` - Enable SMS-based MFA

#### MFA Verification
- `POST /auth/mfa/verify-token` - Verify MFA token during login

#### MFA Management
- `GET /auth/mfa/status` - Get current MFA status
- `POST /auth/mfa/regenerate-backup-codes` - Generate new recovery codes
- `DELETE /auth/mfa/disable` - Disable MFA

### Security Features
- TOTP implementation using speakeasy library
- QR code generation for easy setup
- 10 backup codes for account recovery
- Session tracking for audit
- Rate limiting on verification attempts (recommended)

### Dependencies Required
Add to `package.json`:
```json
{
  "speakeasy": "^2.0.0",
  "qrcode": "^1.5.3"
}
```

### Integration Steps
1. Add MfaModule to app.module.ts imports
2. Run database migration to add mfaConfig and mfaSessions columns
3. Update auth.service.ts to check MFA status post-login
4. Implement MFA token verification in JWT guard

### Suggested Auth Flow Modification
```
1. User submits email/password
2. Validate credentials
3. If user has MFA enabled:
   - Return temporary token with limited scope
   - Client sends MFA token
   - Validate MFA token
   - Issue full JWT
4. If no MFA: Issue JWT immediately
```

---

## Issue #954: Cross-Event Pass Packages

**Status**: ✅ Completed  
**Files Created**:
- `backend/src/pass-packages/entities/pass-package.entity.ts`
- `backend/src/pass-packages/pass-packages.service.ts`
- `backend/src/pass-packages/dto/create-pass-package.dto.ts`
- `backend/src/pass-packages/pass-packages.controller.ts`
- `backend/src/pass-packages/pass-packages.module.ts`

### Summary
Implemented flexible pass package system allowing organizers to create bundle deals across multiple events.

### Database Schema

#### PassPackage Entity
- `id`: UUID primary key
- `name`: Package name
- `description`: Package description
- `price`: Decimal price
- `currency`: Currency code
- `eventsAllowed`: Number of events pass holder can attend (e.g., 3)
- `totalEvents`: Total events in package (e.g., 10)
- `eventIds`: Array of event UUIDs included
- `validUntil`: Expiration date
- `createdBy`: Organizer user ID
- `isActive`: Active status
- `maxPackagesToSell`: Optional limit on units
- `packagesSold`: Count of sold packages

#### UserPassPackage Entity
- `id`: UUID primary key
- `userId`: User who purchased the pass
- `passPackageId`: Package ID
- `remainingAllowance`: Events still available to use
- `usedCount`: Times pass has been used
- `usedEventIds`: Array of event IDs already attended
- `purchaseDate`: When pass was purchased
- `expiryDate`: When pass expires
- `transactionHash`: Stellar transaction ID

### Core Functions

#### `create_pass_package()`
Creates new pass package with customizable limits
```typescript
createPassPackage(creator: User, dto: CreatePassPackageDto)
```

#### `deduct_pass_allowance()`
Reduces remaining allowance when pass is used
```typescript
deductPassAllowance(passId: string, eventId: string)
```

#### `check_pass_balance()`
Returns current pass status and remaining uses
```typescript
checkPassBalance(passId: string)
```

#### Additional Functions
- `purchasePassPackage()` - Handle pass purchase
- `checkEventEligibility()` - Verify pass valid for event
- `getUserPassPackages()` - List user's passes
- `updatePassPackage()` - Update package details
- `deletePassPackage()` - Soft delete package

### API Endpoints

#### Public
- `GET /pass-packages` - List all available packages
- `GET /pass-packages/:id` - Get package details
- `POST /pass-packages/:id/purchase` - Purchase a package

#### Authenticated User
- `GET /pass-packages/my-passes` - Get purchased passes
- `GET /pass-packages/:passId/balance` - Check pass balance
- `GET /pass-packages/:passId/check-event/:eventId` - Check eligibility
- `POST /pass-packages/:passId/use-event/:eventId` - Use pass for event

#### Organizer/Admin
- `POST /pass-packages` - Create new package
- `PATCH /pass-packages/:id` - Update package
- `DELETE /pass-packages/:id` - Delete package

### Integration Points
1. Add PassPackagesModule to app.module.ts
2. Run database migrations for PassPackage and UserPassPackage
3. Integrate with registration system to check pass eligibility
4. Update ticket purchase flow to support pass packages

---

## Issue #956: Real-Time Fraud Detection

**Status**: ✅ Completed  
**Files Created**:
- `backend/src/fraud-detection/entities/flagged-transaction.entity.ts`
- `backend/src/fraud-detection/fraud-detection.service.ts`
- `backend/src/fraud-detection/fraud-detection.controller.ts`
- `backend/src/fraud-detection/fraud-detection.module.ts`

### Summary
Implemented comprehensive fraud detection system for secondary marketplace with pattern matching and real-time analysis.

### Database Schema

#### FlaggedTransaction Entity
- `id`: UUID primary key
- `transactionHash`: Secondary market transaction ID
- `eventId`: Associated event
- `sellerId`: Ticket seller user ID
- `buyerId`: Ticket buyer user ID
- `originalPrice`: Initial ticket price
- `salePrice`: Resale price
- `flagReason`: Enum (WASH_TRADING, BOT_ACTIVITY, SUSPICIOUS_PRICING, UNUSUAL_VELOCITY, PATTERN_MATCHING)
- `riskScore`: 0-1 decimal indicating risk level
- `fraudIndicators`: JSONB object with detailed indicators
- `status`: Enum (pending, reviewed, cleared, confirmed_fraud, action_taken)
- `reviewNotes`: Admin review comments
- `reviewedBy`: Admin user ID
- `actionTaken`: JSONB with action details and timestamp

### Core Fraud Detection Functions

#### `analyze_trade_patterns()`
Analyzes batch of trades for fraud indicators
```typescript
analyzeTradePatterns(eventId: string, trades: TradePattern[])
```
Returns:
- List of suspicious transaction hashes
- Count of detected wash trades
- Count of bot activity indicators
- Count of suspicious pricing instances
- Overall risk score

#### `flag_fraudulent_transaction()`
Flags individual transaction for review
```typescript
flagFraudulentTransaction(
  transactionHash: string,
  sellerId: string,
  buyerId: string,
  originalPrice: number,
  salePrice: number,
  eventId: string,
  flagReason: FraudFlagReason,
  riskScore: number,
  fraudIndicators?: Record<string, any>
)
```

#### `hold_suspicious_trade()`
Suspends trade from completing pending review
```typescript
holdSuspiciousTrade(transactionHash: string, reason: string)
```

#### Additional Functions
- `getSecondaryMarketAnalytics()` - Get event-level fraud metrics
- `getFlaggedTransactions()` - Query flagged transactions
- `reviewFlaggedTransaction()` - Admin review and action
- `calculateTradeRiskScore()` - Real-time risk scoring
- `detectFraudPatterns()` - Pattern-based detection

### Fraud Detection Heuristics

#### Wash Trading Detection
- Detects same parties trading back and forth
- Looks for reverse trades within 1 hour
- High risk indicator

#### Bot Activity Detection
- Identifies rapid sequential transactions
- Tracks same account trading > 3 times in 5 minutes
- Flags unusual trading velocity

#### Suspicious Pricing
- Flags price markups > 150% (very high risk)
- Flags price markups > 100% (medium risk)
- Detects unusually low prices (< 50% original)

#### Pattern Matching
- Circular trading patterns
- Rapid seller/buyer patterns
- Coordinated trading rings

### Risk Scoring Algorithm
```
Base Score = 0

Price Deviation:
  > 150% markup: +0.30
  > 100% markup: +0.15
  < 50% original: +0.20

Velocity (time since purchase):
  < 30 mins: +0.20
  < 60 mins: +0.10

Account Age:
  New account: +0.20

Transaction Frequency:
  > 10 transactions: +0.15

Final Score = min(1.0, base + accumulated)
```

### API Endpoints

#### Admin/Organizer
- `GET /fraud-detection/secondary-market-analytics/:eventId` - Get event fraud metrics
- `GET /fraud-detection/flagged-transactions` - List flagged trades
- `GET /fraud-detection/flagged-transactions/:id` - Get details
- `PATCH /fraud-detection/flagged-transactions/:id/review` - Review and take action
- `POST /fraud-detection/hold-trade` - Hold suspicious trade
- `POST /fraud-detection/analyze-patterns` - Batch pattern analysis
- `POST /fraud-detection/detect-patterns` - Detect patterns in trades
- `POST /fraud-detection/calculate-risk-score` - Calculate trade risk

#### Admin Only
- `POST /fraud-detection/flag-transaction` - Manually flag transaction

### Integration Points
1. Add FraudDetectionModule to app.module.ts
2. Run database migration for FlaggedTransaction
3. Hook into resale ticket purchase flow to check flags
4. Implement real-time pattern analysis on new trades
5. Add admin dashboard for flagged transactions review

### Recommended Real-Time Integration
```typescript
// In resale.service.ts, after trade initiation:

const trade = { /* ... */ };
const riskScore = await fraudDetectionService.calculateTradeRiskScore(
  trade.originalPrice,
  trade.salePrice,
  timeSincePurchaseMinutes,
  buyerTransactionCount,
  isNewAccount
);

if (riskScore > 0.7) {
  // Hold trade and flag for review
  await fraudDetectionService.holdSuspiciousTrade(
    transactionHash,
    'High risk score detected'
  );
  
  // Notify admin
  await notificationService.alertAdminFraud(trade);
}
```

---

## Database Migrations Required

### New Tables
1. `pass_packages` - PassPackage entity
2. `user_pass_packages` - UserPassPackage entity
3. `flagged_transactions` - FlaggedTransaction entity

### Modified Tables
1. `users` - Add mfaConfig and mfaSessions columns

### Migration SQL Template
```sql
-- Add MFA columns to users table
ALTER TABLE users 
ADD COLUMN mfa_config jsonb DEFAULT NULL,
ADD COLUMN mfa_sessions jsonb DEFAULT NULL;

-- Create pass_packages table
CREATE TABLE pass_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL,
  description text NOT NULL,
  price decimal(10,2) NOT NULL,
  currency varchar(3) DEFAULT 'USD',
  events_allowed integer NOT NULL,
  total_events integer NOT NULL,
  event_ids uuid[] NOT NULL,
  valid_until timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  is_active boolean DEFAULT true,
  max_packages_to_sell integer DEFAULT NULL,
  packages_sold integer DEFAULT 0,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  deleted_at timestamptz DEFAULT NULL
);

-- Create user_pass_packages table
CREATE TABLE user_pass_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pass_package_id uuid NOT NULL REFERENCES pass_packages(id) ON DELETE CASCADE,
  remaining_allowance integer NOT NULL,
  used_count integer DEFAULT 0,
  used_event_ids uuid[] DEFAULT ARRAY[]::uuid[],
  purchase_date timestamptz DEFAULT NOW(),
  expiry_date timestamptz NOT NULL,
  transaction_hash varchar(255) DEFAULT NULL,
  updated_at timestamptz DEFAULT NOW(),
  deleted_at timestamptz DEFAULT NULL
);

-- Create flagged_transactions table
CREATE TABLE flagged_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_hash varchar(255) NOT NULL UNIQUE,
  event_id uuid DEFAULT NULL REFERENCES events(id),
  seller_id uuid DEFAULT NULL REFERENCES users(id),
  buyer_id uuid DEFAULT NULL REFERENCES users(id),
  original_price decimal(10,2) NOT NULL,
  sale_price decimal(10,2) NOT NULL,
  flag_reason varchar(50) NOT NULL,
  risk_score decimal(3,2) NOT NULL,
  fraud_indicators jsonb DEFAULT NULL,
  status varchar(50) DEFAULT 'pending',
  review_notes text DEFAULT NULL,
  reviewed_by uuid DEFAULT NULL REFERENCES users(id),
  action_taken jsonb DEFAULT NULL,
  flagged_at timestamptz DEFAULT NOW(),
  reviewed_at timestamptz DEFAULT NULL,
  updated_at timestamptz DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_pass_packages_created_by ON pass_packages(created_by);
CREATE INDEX idx_user_pass_packages_user_id ON user_pass_packages(user_id);
CREATE INDEX idx_user_pass_packages_pass_id ON user_pass_packages(pass_package_id);
CREATE INDEX idx_flagged_transactions_event_id ON flagged_transactions(event_id);
CREATE INDEX idx_flagged_transactions_status ON flagged_transactions(status);
CREATE INDEX idx_flagged_transactions_flagged_at ON flagged_transactions(flagged_at);
```

---

## Testing Recommendations

### MFA Testing
- Unit test TOTP generation and verification
- Test backup code functionality
- Test session management
- Integration test with auth flow

### Pass Packages Testing
- Test package creation with various configurations
- Test pass purchase and balance tracking
- Test allowance deduction
- Test expiration handling
- Test event eligibility checking

### Fraud Detection Testing
- Test wash trading detection algorithm
- Test bot activity detection
- Test suspicious pricing detection
- Test pattern matching
- Test risk score calculation
- Test admin review workflow

---

## Dependencies to Add

### package.json additions
```json
{
  "speakeasy": "^2.0.0",
  "qrcode": "^1.5.3"
}
```

### Already available
- TypeORM (entities)
- NestJS (framework)
- Passport (auth)
- class-validator (validation)

---

## Deployment Notes

1. **Database Migrations**: Run migrations before deploying code
2. **Module Registration**: Add new modules to app.module.ts
3. **Environment Variables**: No new env vars required
4. **Feature Flags**: Consider feature flags for new endpoints (optional)
5. **Rate Limiting**: Implement on MFA endpoints to prevent brute force
6. **Monitoring**: Add fraud detection alerts to monitoring dashboard
7. **Documentation**: Update API docs with new endpoints

---

## Future Enhancements

### MFA
- FIDO2/WebAuthn support
- Recovery email option
- Session revocation
- MFA enforcement policies

### Pass Packages
- Package upgrade/downgrade
- Pass transfer between users
- Partial refund on unused passes
- Dynamic pricing based on demand

### Fraud Detection
- Machine learning model integration
- Behavioral analysis
- Real-time webhook alerts
- Automated action execution
- Fraud statistics dashboard
