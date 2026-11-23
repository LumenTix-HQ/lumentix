# Implementation Plan: Promo Code Support

## Overview
This document outlines the implementation tasks for adding promo code support to the Lumentix backend system. The implementation will bridge the gap between existing smart contract functionality and backend API access, enabling organizers to create and manage promo codes and users to apply discounts during checkout.

## Tasks

### Phase 1: Foundation Setup (Week 1-2)

- [ ] 1.1: Database Schema Implementation
  - **Description**: Create database tables for promo code metadata and usage tracking
  - **Implementation Steps**:
    1. Create TypeORM migration for `promo_code_metadata` table
    2. Create TypeORM migration for `promo_code_usage` table
    3. Add foreign key constraints to events and users tables
    4. Create database indexes for performance optimization
    5. Add seed data for testing
  - **Dependencies**: None
  - **Acceptance Criteria**:
    - Tables are created with correct columns and data types
    - Foreign key constraints properly reference events and users tables
    - Indexes are created on frequently queried columns (event_id, code, user_id)
    - Migration can be rolled back without data loss
    - Schema matches design document specifications
  - **Estimated Effort**: 2 days

- [ ] 1.2: Module Structure Setup
  - **Description**: Create the promo-codes module directory structure and base files
  - **Implementation Steps**:
    1. Create `backend/src/promo-codes/` directory
    2. Create subdirectories: `dto/`, `entities/`, `constants/`
    3. Create module files: `promo-codes.module.ts`, `promo-codes.controller.ts`, `promo-codes.service.ts`
    4. Set up module imports and exports
    5. Configure module dependencies (StellarModule, EventsModule, UsersModule, PaymentsModule)
  - **Dependencies**: Task 1.1 (database entities)
  - **Acceptance Criteria**:
    - Module structure matches design document
    - All required files are created with proper TypeScript structure
    - Module imports and exports are correctly configured
    - Module is registered in the main app module
    - Module follows existing project patterns and conventions
  - **Estimated Effort**: 1 day

- [ ] 1.3: DTO Definitions and Validation
  - **Description**: Create data transfer objects with proper validation
  - **Implementation Steps**:
    1. Create `create-promo-code.dto.ts` with class-validator decorators
    2. Create `apply-promo-code.dto.ts` with validation rules
    3. Create `validate-promo-code.dto.ts` for validation requests
    4. Create `update-promo-code.dto.ts` for metadata updates
    5. Create response DTOs for API responses
    6. Add custom validators for business rules (future dates, discount ranges)
  - **Dependencies**: Task 1.2 (module structure)
  - **Acceptance Criteria**:
    - All DTOs have proper TypeScript types and validation decorators
    - Validation rules match design document specifications
    - Custom validators handle business logic constraints
    - Error messages are clear and user-friendly
    - DTOs follow existing project patterns
  - **Estimated Effort**: 1 day

- [ ] 1.4: Entity Definitions
  - **Description**: Create TypeORM entity classes for database tables
  - **Implementation Steps**:
    1. Create `promo-code-metadata.entity.ts` with all columns and decorators
    2. Create `promo-code-usage.entity.ts` with proper relationships
    3. Add repository classes for each entity
    4. Define entity relationships (one-to-one with events, many-to-one with users)
    5. Add entity lifecycle hooks (createdAt, updatedAt auto-update)
  - **Dependencies**: Task 1.1 (database schema)
  - **Acceptance Criteria**:
    - Entities have correct column mappings and decorators
    - Relationships are properly defined with cascade options
    - Repository patterns follow existing project conventions
    - Lifecycle hooks work correctly
    - Entities support the required queries from design document
  - **Estimated Effort**: 1 day

### Phase 2: Core Service Implementation (Week 3-4)

- [ ] 2.1: Service Layer - Creation and Management
  - **Description**: Implement service methods for creating and managing promo codes
  - **Implementation Steps**:
    1. Implement `createPromoCode()` method with organizer validation
    2. Implement `updatePromoCodeMetadata()` for metadata updates
    3. Implement `deactivatePromoCode()` method for disabling codes
    4. Add organizer permission checks using EventsModule
    5. Implement database transaction handling
  - **Dependencies**: Tasks 1.2-1.4 (module, DTOs, entities)
  - **Acceptance Criteria**:
    - Only event organizers can create promo codes for their events
    - Metadata updates are properly validated and persisted
    - Deactivation sets appropriate timestamps and flags
    - Database transactions ensure data consistency
    - Error handling follows existing patterns
  - **Estimated Effort**: 2 days

- [ ] 2.2: Smart Contract Integration - Base Layer
  - **Description**: Implement integration with Soroban smart contract functions
  - **Implementation Steps**:
    1. Create contract interaction methods in service
    2. Implement `callContractCreatePromoCode()` method
    3. Implement `callContractValidatePromoCode()` method
    4. Implement `callContractApplyPromoCode()` method
    5. Add error mapping from contract errors to HTTP responses
  - **Dependencies**: Existing StellarModule, Task 2.1 (service layer)
  - **Acceptance Criteria**:
    - Contract calls use proper Soroban client setup
    - Error mapping covers all contract error types
    - Transaction hashes are properly stored and returned
    - Contract calls handle network timeouts and retries
    - Integration follows existing StellarModule patterns
  - **Estimated Effort**: 2 days

- [ ] 2.3: Service Layer - Validation Logic
  - **Description**: Implement promo code validation logic
  - **Implementation Steps**:
    1. Implement `validatePromoCode()` method combining contract and local checks
    2. Add rate limiting for validation requests
    3. Implement caching for frequent validation requests
    4. Add expiration date checking
    5. Implement usage limit validation (global and per-user)
  - **Dependencies**: Tasks 2.1-2.2 (service and contract integration)
  - **Acceptance Criteria**:
    - Validation combines contract checks with local database checks
    - Rate limiting prevents abuse of validation endpoint
    - Caching improves performance for repeated validations
    - Expiration dates are properly checked
    - Usage limits are enforced correctly
  - **Estimated Effort**: 2 days

- [ ] 2.4: Service Layer - Application Logic
  - **Description**: Implement promo code application logic
  - **Implementation Steps**:
    1. Implement `applyPromoCode()` method with transaction flow
    2. Add idempotency checks to prevent duplicate applications
    3. Implement usage recording in database
    4. Add integration with PaymentsModule for payment updates
    5. Implement proper error rollback for failed applications
  - **Dependencies**: Tasks 2.1-2.3 (service methods), PaymentsModule
  - **Acceptance Criteria**:
    - Application records usage in both contract and database
    - Idempotency prevents double discounts
    - Failed applications roll back database changes
    - Payment records are updated with discount amounts
    - Transaction flow matches design document
  - **Estimated Effort**: 2 days

### Phase 3: API Endpoints (Week 5-6)

- [ ] 3.1: Public API Endpoints
  - **Description**: Implement public endpoints for users to validate and apply promo codes
  - **Implementation Steps**:
    1. Implement `POST /api/promo-codes/validate` endpoint
    2. Implement `POST /api/promo-codes/apply` endpoint
    3. Add proper authentication and authorization
    4. Implement request validation using DTOs
    5. Add API documentation with Swagger/OpenAPI
  - **Dependencies**: Tasks 2.1-2.4 (service methods)
  - **Acceptance Criteria**:
    - Endpoints accept and validate proper request bodies
    - Authentication and authorization work correctly
    - Responses match design document formats
    - Error responses are standardized
    - API documentation is complete and accurate
  - **Estimated Effort**: 2 days

- [ ] 3.2: Organizer API Endpoints
  - **Description**: Implement endpoints for organizers to manage promo codes
  - **Implementation Steps**:
    1. Implement `POST /api/promo-codes` for creating promo codes
    2. Implement `GET /api/promo-codes/event/:eventId` for listing codes
    3. Implement `PATCH /api/promo-codes/:eventId/:code` for updates
    4. Implement `GET /api/promo-codes/:eventId/:code/usage` for statistics
    5. Add organizer permission checks using existing auth guards
  - **Dependencies**: Tasks 2.1-2.4 (service methods)
  - **Acceptance Criteria**:
    - Only event organizers can access organizer endpoints
    - Endpoints return proper pagination for lists
    - Updates properly validate organizer permissions
    - Usage statistics include required metrics
    - Responses follow design document specifications
  - **Estimated Effort**: 2 days

- [ ] 3.3: API Error Handling and Validation
  - **Description**: Implement comprehensive error handling and input validation
  - **Implementation Steps**:
    1. Create custom exception filters for promo code errors
    2. Implement validation pipes for all endpoints
    3. Add request logging and correlation IDs
    4. Implement consistent error response format
    5. Add input sanitization for security
  - **Dependencies**: Tasks 3.1-3.2 (API endpoints)
  - **Acceptance Criteria**:
    - All inputs are properly validated before processing
    - Error responses follow consistent format
    - Security vulnerabilities are prevented through sanitization
    - Request tracing works with correlation IDs
    - Exception filters handle all promo code error types
  - **Estimated Effort**: 1 day

- [ ] 3.4: API Documentation
  - **Description**: Create comprehensive API documentation
  - **Implementation Steps**:
    1. Add Swagger/OpenAPI decorators to all endpoints
    2. Create API documentation page
    3. Add example requests and responses
    4. Document error codes and meanings
    5. Create API usage examples for common scenarios
  - **Dependencies**: Tasks 3.1-3.3 (API implementation)
  - **Acceptance Criteria**:
    - All endpoints have proper Swagger documentation
    - Documentation includes example requests and responses
    - Error codes are clearly explained
    - Usage examples cover common scenarios
    - Documentation is accessible through /api/docs endpoint
  - **Estimated Effort**: 1 day

### Phase 4: Testing Implementation (Week 7-8)

- [ ] 4.1: Unit Tests - Service Layer
  - **Description**: Write unit tests for service layer methods
  - **Implementation Steps**:
    1. Create `promo-codes.service.spec.ts` test file
    2. Mock all external dependencies (database, contract, other modules)
    3. Test `createPromoCode()` with various scenarios
    4. Test `validatePromoCode()` with valid and invalid inputs
    5. Test `applyPromoCode()` with success and failure cases
    6. Test error handling and edge cases
  - **Dependencies**: Tasks 2.1-2.4 (service implementation)
  - **Acceptance Criteria**:
    - Service methods have >90% test coverage
    - All edge cases are tested (expired codes, exceeded limits, etc.)
    - Mocked dependencies test integration points
    - Error scenarios are properly tested
    - Tests follow existing project patterns
  - **Estimated Effort**: 2 days

- [ ] 4.2: Unit Tests - Controller Layer
  - **Description**: Write unit tests for controller endpoints
  - **Implementation Steps**:
    1. Create `promo-codes.controller.spec.ts` test file
    2. Mock service layer for controller tests
    3. Test all endpoint success cases
    4. Test endpoint validation and error responses
    5. Test authentication and authorization scenarios
    6. Test request/response formatting
  - **Dependencies**: Tasks 3.1-3.3 (API implementation)
  - **Acceptance Criteria**:
    - All endpoints have comprehensive test coverage
    - Authentication and authorization are properly tested
    - Validation errors are tested for all endpoints
    - Response formatting matches specifications
    - Tests use proper HTTP testing utilities
  - **Estimated Effort**: 2 days

- [ ] 4.3: Integration Tests
  - **Description**: Write integration tests for database and contract interactions
  - **Implementation Steps**:
    1. Set up test database with proper migrations
    2. Create integration test suite for database operations
    3. Test entity persistence and relationships
    4. Create contract integration tests (using testnet or mocks)
    5. Test transaction rollback scenarios
    6. Test concurrent access handling
  - **Dependencies**: Tasks 1.1-1.4 (database setup), Task 2.2 (contract integration)
  - **Acceptance Criteria**:
    - Database operations work correctly with real database
    - Entity relationships are properly tested
    - Contract integration tests validate actual interactions
    - Transaction handling is tested under failure conditions
    - Concurrent operations don't cause data corruption
  - **Estimated Effort**: 3 days

- [ ] 4.4: End-to-End Tests
  - **Description**: Write end-to-end tests for complete user flows
  - **Implementation Steps**:
    1. Create end-to-end test scenarios
    2. Test organizer creates promo code → user validates → user applies
    3. Test multiple users applying same promo code with limits
    4. Test promo code expiration and reactivation
    5. Test error scenarios end-to-end
    6. Test analytics and reporting flows
  - **Dependencies**: All previous implementation tasks
  - **Acceptance Criteria**:
    - Complete user flows work end-to-end
    - Multiple user scenarios are tested
    - Time-based scenarios (expiration) are properly tested
    - Error scenarios are tested throughout the flow
    - Tests run in CI/CD pipeline
  - **Estimated Effort**: 2 days

### Phase 5: Integration and Documentation (Week 9-10)

- [ ] 5.1: Integration with Payments Module
  - **Description**: Integrate promo code functionality with existing payments system
  - **Implementation Steps**:
    1. Update payment creation to accept promo code parameter
    2. Modify payment processing to call promo code service
    3. Update payment records to store discount information
    4. Add promo code validation during checkout flow
    5. Ensure analytics continue to track promo code usage in payments
  - **Dependencies**: Tasks 2.4 (application logic), existing PaymentsModule
  - **Acceptance Criteria**:
    - Payment creation accepts and validates promo codes
    - Discount amounts are properly calculated and applied
    - Payment records store promo code information for analytics
    - Checkout flow includes promo code validation
    - Existing payment analytics continue to work with promo codes
  - **Estimated Effort**: 2 days

- [ ] 5.2: Analytics and Reporting Integration
  - **Description**: Integrate promo code usage with analytics and reporting systems
  - **Implementation Steps**:
    1. Update revenue reporting to include promo code discounts
    2. Add promo code performance metrics to analytics dashboard
    3. Implement promo code usage tracking for organizers
    4. Add export functionality for promo code usage reports
    5. Integrate with existing reporting endpoints
  - **Dependencies**: Tasks 3.2 (organizer endpoints), existing AnalyticsModule
  - **Acceptance Criteria**:
    - Revenue reports correctly account for promo code discounts
    - Organizers can view promo code performance metrics
    - Usage reports can be exported in CSV/Excel formats
    - Analytics dashboard includes promo code metrics
    - Integration follows existing reporting patterns
  - **Estimated Effort**: 2 days

- [ ] 5.3: Performance Optimization
  - **Description**: Optimize performance for high-volume usage
  - **Implementation Steps**:
    1. Implement caching for frequently validated promo codes
    2. Add database query optimization
    3. Implement connection pooling for contract calls
    4. Add rate limiting for high-traffic endpoints
    5. Optimize bulk operations for organizers
  - **Dependencies**: All previous implementation tasks
  - **Acceptance Criteria**:
    - Validation endpoints respond within <100ms under load
    - Database queries use proper indexes and optimization
    - Contract calls use efficient connection management
    - Rate limiting prevents system overload
    - Bulk operations handle large datasets efficiently
  - **Estimated Effort**: 2 days

- [ ] 5.4: Documentation
  - **Description**: Create comprehensive documentation for the feature
  - **Implementation Steps**:
    1. Create README for promo-codes module
    2. Document API usage for frontend developers
    3. Create setup and configuration guide
    4. Document error handling and troubleshooting
    5. Create deployment and monitoring guide
  - **Dependencies**: All previous implementation tasks
  - **Acceptance Criteria**:
    - Module README explains purpose and usage
    - API documentation is complete for frontend integration
    - Setup guide covers all configuration options
    - Troubleshooting guide helps diagnose common issues
    - Monitoring guide explains what metrics to watch
  - **Estimated Effort**: 2 days

### Phase 6: Deployment and Monitoring (Week 11-12)

- [ ] 6.1: Database Migration Deployment
  - **Description**: Deploy database migrations to production
  - **Implementation Steps**:
    1. Create production migration scripts
    2. Test migration rollback procedures
    3. Schedule migration during maintenance window
    4. Deploy migrations to production database
    5. Verify data integrity post-migration
  - **Dependencies**: Task 1.1 (database schema)
  - **Acceptance Criteria**:
    - Migrations run successfully in production
    - Rollback procedures are tested and verified
    - No data loss during migration
    - Database performance is not impacted
    - All constraints and indexes are properly created
  - **Estimated Effort**: 1 day

- [ ] 6.2: Code Deployment
  - **Description**: Deploy promo code module to production environment
  - **Implementation Steps**:
    1. Build and test production bundle
    2. Deploy to staging environment for final testing
    3. Perform smoke tests in staging
    4. Deploy to production using CI/CD pipeline
    5. Verify service health post-deployment
  - **Dependencies**: All previous implementation tasks
  - **Acceptance Criteria**:
    - Production build passes all tests
    - Staging deployment verifies integration with other services
    - Smoke tests pass in staging environment
    - Production deployment completes without downtime
    - Health checks pass post-deployment
  - **Estimated Effort**: 1 day

- [ ] 6.3: Monitoring and Alerting Setup
  - **Description**: Set up monitoring and alerting for promo code functionality
  - **Implementation Steps**:
    1. Add Prometheus metrics for API endpoints
    2. Set up dashboards for promo code usage metrics
    3. Configure alerts for error rates and performance issues
    4. Add logging for audit trail and debugging
    5. Set up health checks for service dependencies
  - **Dependencies**: Task 5.3 (performance optimization)
  - **Acceptance Criteria**:
    - Metrics track API response times and error rates
    - Dashboards show real-time promo code usage
    - Alerts trigger for abnormal error rates or performance
    - Audit logs track all promo code creations and applications
    - Health checks monitor contract and database connectivity
  - **Estimated Effort**: 2 days

- [ ] 6.4: Post-Deployment Verification
  - **Description**: Verify functionality and performance in production
  - **Implementation Steps**:
    1. Run smoke tests in production environment
    2. Verify all API endpoints are accessible
    3. Test promo code creation and application flows
    4. Monitor system performance under real load
    5. Gather feedback from initial users
  - **Dependencies**: Tasks 6.1-6.3 (deployment and monitoring)
  - **Acceptance Criteria**:
    - All endpoints work correctly in production
    - Promo code creation and application flows work end-to-end
    - System performance meets requirements under load
    - No critical bugs are reported by initial users
    - Monitoring shows healthy system state
  - **Estimated Effort**: 1 day

## Notes

### Total Estimated Effort: 46 days

**Phase Breakdown**:
- Phase 1 (Foundation): 5 days
- Phase 2 (Core Service): 8 days
- Phase 3 (API Endpoints): 6 days
- Phase 4 (Testing): 9 days
- Phase 5 (Integration): 8 days
- Phase 6 (Deployment): 5 days

**Key Dependencies**:
1. Existing StellarModule for smart contract integration
2. EventsModule for organizer permission validation
3. UsersModule for user authentication and identification
4. PaymentsModule for payment processing integration
5. AnalyticsModule for reporting and metrics

**Risk Mitigation**:
1. Start with thorough design review to prevent rework
2. Implement comprehensive testing to catch issues early
3. Use feature flags for gradual rollout
4. Monitor closely after deployment for any issues
5. Have rollback plan for database migrations

**Success Criteria**:
1. Organizers can create and manage promo codes through backend API
2. Users can validate and apply promo code discounts during checkout
3. System integrates properly with existing smart contract functionality
4. All acceptance criteria from bugfix document are met
5. Performance meets requirements under expected load