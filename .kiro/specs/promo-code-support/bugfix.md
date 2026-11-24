# Bugfix Requirements Document

## Introduction

The backend currently lacks a proper promo code management module/service despite the smart contract having full implementation of promo code functions (`create_promo_code`, `apply_promo_code_discount`, `validate_promo_code_limits`). This creates an inconsistency where the smart contract functionality exists but cannot be properly utilized through the backend API. Organizers cannot create or manage promo codes, and users cannot apply promo code discounts through the backend system.

## Bug Analysis

### Current Behavior (Defect)

[What currently happens when the bug is triggered]

1.1 WHEN an organizer attempts to create a promo code through the backend API THEN the system returns "Not Found" or "Not Implemented" error because no promo code module exists
1.2 WHEN a user attempts to apply a promo code discount during checkout THEN the system cannot validate or apply the discount through backend services
1.3 WHEN the system needs to check promo code validity THEN there is no backend service to call the smart contract validation function
1.4 WHEN promo code usage limits need to be enforced THEN the backend cannot coordinate with the smart contract's global and per-user limit tracking

### Expected Behavior (Correct)

[What should happen instead]

2.1 WHEN an organizer creates a promo code through the backend API THEN the system SHALL call the smart contract `create_promo_code` function and store relevant metadata in the backend database
2.2 WHEN a user applies a promo code discount during checkout THEN the system SHALL call the smart contract `validate_promo_code_limits` and `apply_promo_code_discount` functions to validate and apply the discount
2.3 WHEN the system needs to check promo code validity THEN the backend SHALL provide a service that calls the smart contract validation function and returns the result
2.4 WHEN promo code usage limits need to be enforced THEN the backend SHALL coordinate with the smart contract's tracking of global and per-user limits

### Unchanged Behavior (Regression Prevention)

[Existing behavior that must be preserved]

3.1 WHEN analytics track revenue by promo code THEN the system SHALL CONTINUE TO correctly aggregate payments with promoCode field in the database
3.2 WHEN payment records are created THEN the system SHALL CONTINUE TO store the promoCode field for tracking purposes
3.3 WHEN smart contract functions are called directly THEN they SHALL CONTINUE TO work as currently implemented with expiration dates, global limits, and individual user limits
3.4 WHEN the payments table is queried THEN the system SHALL CONTINUE TO return promoCode field in payment records