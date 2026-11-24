# Promo Code Support Design Document

## Overview

This document outlines the design for implementing promo code management functionality in the Lumentix backend system. The design addresses the current gap where smart contract promo code functionality exists but cannot be utilized through the backend API.

## 1. Module Structure

### 1.1 New Module: `promo-codes`

The promo code functionality will be implemented as a standalone NestJS module following the established project patterns.

```
backend/src/promo-codes/
├── dto/
│   ├── create-promo-code.dto.ts
│   ├── apply-promo-code.dto.ts
│   └── validate-promo-code.dto.ts
├── entities/
│   ├── promo-code-metadata.entity.ts
│   └── promo-code-usage.entity.ts
├── promo-codes.controller.ts
├── promo-codes.module.ts
├── promo-codes.service.ts
├── promo-codes.service.spec.ts
└── constants/
    └── promo-codes.constants.ts
```

### 1.2 Module Dependencies

The promo-codes module will depend on:
- **StellarModule**: For Soroban smart contract interactions
- **EventsModule**: To validate event existence and organizer permissions
- **UsersModule**: For user identification and authorization
- **PaymentsModule**: For integration with payment processing

## 2. Database Schema

### 2.1 Primary Entities

#### 2.1.1 `PromoCodeMetadata` Entity
Stores metadata about promo codes that complements the on-chain data.

```typescript
@Entity('promo_code_metadata')
export class PromoCodeMetadata {
  @PrimaryColumn('bigint')
  eventId: number;

  @PrimaryColumn('varchar', { length: 50 })
  code: string;

  @Column('varchar', { length: 255, nullable: true })
  description: string;

  @Column('boolean', { default: true })
  isActive: boolean;

  @Column('timestamptz', { nullable: true })
  activatedAt: Date;

  @Column('timestamptz', { nullable: true })
  deactivatedAt: Date;

  @Column('integer', { default: 0 })
  timesValidated: number;

  @Column('integer', { default: 0 })
  timesApplied: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  totalDiscountAmount: number;

  @Column('timestamptz', { default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column('timestamptz', { default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @Column('varchar', { length: 255 })
  createdByUserId: string;

  @Column('jsonb', { nullable: true })
  additionalMetadata: Record<string, any>;
}
```

#### 2.1.2 `PromoCodeUsage` Entity
Tracks detailed usage statistics for analytics and reporting.

```typescript
@Entity('promo_code_usage')
export class PromoCodeUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('bigint')
  eventId: number;

  @Column('varchar', { length: 50 })
  code: string;

  @Column('varchar', { length: 255 })
  userId: string;

  @Column('varchar', { length: 255 })
  userAddress: string;

  @Column('timestamptz')
  usedAt: Date;

  @Column('decimal', { precision: 10, scale: 2 })
  originalAmount: number;

  @Column('decimal', { precision: 10, scale: 2 })
  discountAmount: number;

  @Column('decimal', { precision: 10, scale: 2 })
  finalAmount: number;

  @Column('varchar', { length: 50, nullable: true })
  paymentId: string;

  @Column('varchar', { length: 50, nullable: true })
  transactionHash: string;

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any>;
}
```

### 2.2 Database Relationships

1. **PromoCodeMetadata** ↔ **Event**: One-to-one relationship (eventId references events table)
2. **PromoCodeUsage** ↔ **PromoCodeMetadata**: Many-to-one relationship
3. **PromoCodeUsage** ↔ **User**: Many-to-one relationship
4. **PromoCodeUsage** ↔ **Payment**: Optional one-to-one relationship

## 3. API Endpoints

### 3.1 Public Endpoints

#### `POST /api/promo-codes/validate`
Validates if a promo code can be applied for a specific user.

**Request Body:**
```typescript
{
  eventId: number;
  code: string;
  userId: string;
}
```

**Response:**
```typescript
{
  isValid: boolean;
  discountBps: number;
  maxGlobalUses: number;
  maxUsesPerUser: number;
  totalUses: number;
  userUses: number;
  expiresAt: string; // ISO timestamp
  error?: string;
}
```

#### `POST /api/promo-codes/apply`
Applies a promo code discount to a payment amount.

**Request Body:**
```typescript
{
  eventId: number;
  code: string;
  userId: string;
  userAddress: string;
  amount: number; // Original amount in smallest currency unit
  paymentId?: string;
}
```

**Response:**
```typescript
{
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
  discountBps: number;
  transactionHash?: string;
  usageRecordId: string;
}
```

### 3.2 Organizer Endpoints

#### `POST /api/promo-codes`
Creates a new promo code for an event.

**Request Body:**
```typescript
{
  eventId: number;
  code: string;
  discountBps: number; // 100 = 1%, 1000 = 10%, 10000 = 100%
  expiresAt: string; // ISO timestamp
  maxGlobalUses: number; // 0 = unlimited
  maxUsesPerUser: number; // 0 = unlimited
  description?: string;
  additionalMetadata?: Record<string, any>;
}
```

**Response:**
```typescript
{
  eventId: number;
  code: string;
  discountBps: number;
  expiresAt: string;
  maxGlobalUses: number;
  maxUsesPerUser: number;
  transactionHash: string;
  metadataId: number;
}
```

#### `GET /api/promo-codes/event/:eventId`
Lists all promo codes for an event.

**Response:**
```typescript
{
  promoCodes: Array<{
    code: string;
    discountBps: number;
    expiresAt: string;
    maxGlobalUses: number;
    maxUsesPerUser: number;
    totalUses: number;
    active: boolean;
    description?: string;
    timesApplied: number;
    timesValidated: number;
    totalDiscountAmount: number;
  }>;
}
```

#### `PATCH /api/promo-codes/:eventId/:code`
Updates promo code metadata or activates/deactivates a promo code.

**Request Body:**
```typescript
{
  description?: string;
  isActive?: boolean;
  additionalMetadata?: Record<string, any>;
}
```

#### `GET /api/promo-codes/:eventId/:code/usage`
Gets usage statistics for a specific promo code.

**Response:**
```typescript
{
  code: string;
  eventId: number;
  totalUses: number;
  uniqueUsers: number;
  totalDiscountAmount: number;
  recentUsage: Array<{
    userId: string;
    usedAt: string;
    discountAmount: number;
    paymentId?: string;
  }>;
  usageByDate: Array<{
    date: string;
    count: number;
    totalDiscount: number;
  }>;
}
```

## 4. Smart Contract Integration

### 4.1 Contract Function Mapping

The backend will call the following Soroban smart contract functions through the existing Stellar module:

| Backend Function | Smart Contract Function | Purpose |
|-----------------|------------------------|---------|
| `createPromoCode` | `create_promo_code` | Create new promo code on-chain |
| `validatePromoCode` | `validate_promo_code_limits` | Validate promo code eligibility |
| `applyPromoCode` | `apply_promo_code_discount` | Apply discount and record usage |

### 4.2 Integration Architecture

```
Backend Service → StellarService → Soroban Client → Smart Contract
      ↓               ↓                 ↓              ↓
Database ←      Event Listeners ←   Transaction   → On-chain State
```

### 4.3 Error Handling with Contract Errors

The service will map smart contract errors to appropriate HTTP responses:

| Contract Error | HTTP Status | Response Message |
|----------------|-------------|------------------|
| `PromoCodeNotFound` | 404 | "Promo code not found" |
| `PromoCodeAlreadyExists` | 409 | "Promo code already exists" |
| `PromoCodeExpired` | 400 | "Promo code has expired" |
| `PromoCodeInactive` | 400 | "Promo code is not active" |
| `PromoCodeGlobalLimitReached` | 400 | "Promo code usage limit reached" |
| `PromoCodeUserLimitReached` | 400 | "You have reached your usage limit for this promo code" |
| `InvalidPromoDiscount` | 400 | "Invalid discount percentage" |
| `NotEventOrganizer` | 403 | "Only event organizers can create promo codes" |

## 5. Service Layer Design

### 5.1 `PromoCodesService` Core Methods

```typescript
class PromoCodesService {
  // Creation and Management
  async createPromoCode(dto: CreatePromoCodeDto, organizerId: string): Promise<PromoCodeResponse>
  async updatePromoCodeMetadata(eventId: number, code: string, updates: UpdatePromoCodeDto): Promise<void>
  async deactivatePromoCode(eventId: number, code: string, userId: string): Promise<void>
  
  // Validation and Application
  async validatePromoCode(dto: ValidatePromoCodeDto): Promise<ValidationResult>
  async applyPromoCode(dto: ApplyPromoCodeDto): Promise<ApplicationResult>
  
  // Analytics and Reporting
  async getPromoCodeUsage(eventId: number, code: string): Promise<UsageStatistics>
  async getEventPromoCodes(eventId: number): Promise<PromoCodeList>
  
  // Internal Helpers
  private async callContractCreatePromoCode(params: ContractCreateParams): Promise<string>
  private async callContractValidatePromoCode(params: ContractValidateParams): Promise<boolean>
  private async callContractApplyPromoCode(params: ContractApplyParams): Promise<ContractApplyResult>
  private async syncWithContract(eventId: number, code: string): Promise<void>
}
```

### 5.2 Transaction Flow for Apply Promo Code

1. **Validation Phase**:
   - Check local database for promo code metadata
   - Call `validate_promo_code_limits` on smart contract
   - Verify user hasn't exceeded limits
   - Check expiration date

2. **Application Phase**:
   - Call `apply_promo_code_discount` on smart contract
   - Wait for transaction confirmation
   - Record usage in local database
   - Update promo code metadata statistics

3. **Completion Phase**:
   - Return discounted amount
   - Store transaction hash
   - Emit internal event for analytics

## 6. Error Handling and Validation

### 6.1 Input Validation

All DTOs will use class-validator decorators:

```typescript
export class CreatePromoCodeDto {
  @IsInt()
  @Min(1)
  eventId: number;

  @IsString()
  @Length(3, 50)
  @Matches(/^[a-zA-Z0-9-_]+$/)
  code: string;

  @IsInt()
  @Min(1)
  @Max(10000)
  discountBps: number;

  @IsDateString()
  @IsFutureDate()
  expiresAt: string;

  @IsInt()
  @Min(0)
  maxGlobalUses: number;

  @IsInt()
  @Min(0)
  maxUsesPerUser: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
```

### 6.2 Business Logic Validation

1. **Event Existence**: Verify event exists and is active
2. **Organizer Permission**: Only event organizers can create/update promo codes
3. **Date Validation**: Expiration date must be in the future
4. **Rate Limiting**: Prevent abuse of validation endpoints
5. **Idempotency**: Ensure duplicate applications are prevented

### 6.3 Error Response Format

```typescript
{
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
  requestId: string;
  details?: Record<string, any>;
}
```

## 7. Testing Strategy

### 7.1 Unit Tests

**Service Layer Tests:**
- `PromoCodesService` method testing with mocked dependencies
- Contract interaction mocking using `jest-mock-extended`
- Database interaction testing with test database

**Controller Tests:**
- HTTP endpoint validation
- Authentication and authorization
- Error response formatting

### 7.2 Integration Tests

**Database Integration:**
- TypeORM entity persistence
- Transaction rollback testing
- Concurrent access handling

**Contract Integration:**
- Soroban client interaction
- Transaction submission and confirmation
- Error propagation from contract

### 7.3 End-to-End Tests

**API Test Scenarios:**
1. Organizer creates promo code → validates → applies → checks usage
2. Multiple users applying same promo code with limits
3. Promo code expiration and reactivation
4. Error scenarios: invalid codes, exceeded limits, expired codes

**Test Data Setup:**
```typescript
beforeEach(async () => {
  // Create test event
  // Create test users
  // Setup test wallet addresses
  // Mock Stellar network for testing
});
```

### 7.4 Performance Testing

**Load Testing Scenarios:**
- Concurrent promo code validation requests
- Bulk promo code creation
- High-volume usage tracking

**Monitoring Metrics:**
- API response times (p95, p99)
- Database query performance
- Contract call latency
- Memory usage during peak loads

## 8. Security Considerations

### 8.1 Authorization
- Organizer-only endpoints require event ownership verification
- User-specific endpoints require user authentication
- Role-based access control using existing auth guards

### 8.2 Input Sanitization
- Prevent SQL injection through parameterized queries
- Validate and sanitize promo code strings
- Limit metadata JSON size and depth

### 8.3 Rate Limiting
- Implement per-user rate limiting on validation endpoints
- Global rate limiting on promo code creation
- Circuit breaker pattern for contract calls

### 8.4 Audit Trail
- Log all promo code creations and modifications
- Track all validation and application attempts
- Store transaction hashes for blockchain verification

## 9. Deployment and Monitoring

### 9.1 Database Migrations
```sql
-- Create promo_code_metadata table
CREATE TABLE promo_code_metadata (
  event_id BIGINT NOT NULL,
  code VARCHAR(50) NOT NULL,
  -- ... other columns
  PRIMARY KEY (event_id, code)
);

-- Create promo_code_usage table
CREATE TABLE promo_code_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id BIGINT NOT NULL,
  code VARCHAR(50) NOT NULL,
  -- ... other columns
  INDEX idx_promo_code_usage_event_code (event_id, code),
  INDEX idx_promo_code_usage_user (user_id)
);
```

### 9.2 Health Checks
- Database connection monitoring
- Soroban contract availability
- Service dependency health

### 9.3 Monitoring and Alerts
- Prometheus metrics for API usage
- Error rate monitoring
- Contract call failure alerts
- Usage limit threshold alerts

## 10. Future Enhancements

### 10.1 Planned Features
1. **Bulk Operations**: Create multiple promo codes at once
2. **Template System**: Reusable promo code templates
3. **Advanced Analytics**: Predictive modeling for promo code effectiveness
4. **A/B Testing**: Compare different promo code strategies
5. **Scheduled Activation**: Time-based promo code activation

### 10.2 Integration Points
1. **Marketing Platform**: Sync with email campaigns
2. **CRM System**: Track promo code performance by user segment
3. **Analytics Dashboard**: Real-time promo code performance visualization
4. **Mobile SDK**: Native promo code support in mobile apps

## 11. Rollout Plan

### Phase 1: Foundation (Week 1-2)
- Implement database schema and entities
- Create service layer with contract integration
- Implement basic CRUD endpoints

### Phase 2: Validation & Application (Week 3-4)
- Implement validation logic
- Add apply promo code functionality
- Integrate with payments module

### Phase 3: Analytics & Reporting (Week 5-6)
- Add usage tracking and analytics
- Implement organizer dashboard endpoints
- Add monitoring and alerting

### Phase 4: Optimization (Week 7-8)
- Performance tuning
- Add caching layer
- Implement advanced features

## Conclusion

This design provides a comprehensive solution for integrating the existing smart contract promo code functionality with the backend system. The modular approach ensures maintainability, while the thorough testing strategy guarantees reliability. The implementation will bridge the current gap, allowing organizers to create and manage promo codes through the backend API and users to apply discounts during checkout.