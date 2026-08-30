# LumenTix API Reference

Complete documentation of LumenTix public API endpoints, integration guidelines, and code examples.

## Authentication

All authenticated endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

### Obtaining Tokens

#### Email/Password Authentication
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword"
}
```

Response:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "role": "EVENT_GOER"
  }
}
```

#### Wallet-Based Authentication
```bash
POST /api/auth/wallet/challenge
Content-Type: application/json

{
  "publicKey": "GBXWWQZLJ2XDKUYKWZ2ZXNWP2D5V5JLPVFN4XKYPWPQXVPXWHGJ2PJQ"
}
```

## Events API

### List Events
```bash
GET /api/events
Query Parameters:
  - skip: number (default: 0)
  - take: number (default: 20)
  - status: DRAFT|PUBLISHED|COMPLETED|CANCELLED
  - categoryId: uuid
```

Response:
```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Summer Music Festival",
      "description": "Join us for an amazing summer festival",
      "location": "Central Park, NYC",
      "startDate": "2024-07-15T18:00:00Z",
      "endDate": "2024-07-15T23:00:00Z",
      "ticketPrice": "50.00",
      "currency": "USD",
      "maxAttendees": 1000,
      "currentAttendees": 342,
      "status": "PUBLISHED"
    }
  ],
  "total": 245,
  "skip": 0,
  "take": 20
}
```

### Get Event Details
```bash
GET /api/events/{eventId}
```

Response includes full event details, available tickets, registrations, and sponsor information.

### Create Event (Organizer Only)
```bash
POST /api/events
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Tech Conference 2024",
  "description": "Annual tech conference",
  "location": "San Francisco, CA",
  "startDate": "2024-09-01T09:00:00Z",
  "endDate": "2024-09-03T17:00:00Z",
  "ticketPrice": "199.00",
  "currency": "USD",
  "maxAttendees": 500,
  "ageRestriction": 18
}
```

## Tickets API

### Purchase Ticket
```bash
POST /api/tickets/purchase
Authorization: Bearer <token>
Content-Type: application/json

{
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "quantity": 2,
  "stellarSignature": "base64-encoded-ed25519-signature"
}
```

Response:
```json
{
  "tickets": [
    {
      "id": "660f9511-f40c-52e5-b827-557766551111",
      "eventId": "550e8400-e29b-41d4-a716-446655440000",
      "status": "valid",
      "assetCode": "TKTA001",
      "transactionHash": "abc123def456..."
    }
  ]
}
```

### Get My Tickets
```bash
GET /api/tickets/mine
Authorization: Bearer <token>
Query Parameters:
  - status: valid|used|refunded|expired
  - eventId: uuid (optional)
```

### Transfer Ticket
```bash
POST /api/tickets/{ticketId}/transfer
Authorization: Bearer <token>
Content-Type: application/json

{
  "recipientPublicKey": "GBXWWQZLJ2XDKUYKWZ2ZXNWP2D5V5JLPVFN4XKYPWPQXVPXWHGJ2PJQ",
  "stellarSignature": "base64-encoded-ed25519-signature"
}
```

## Registration API

### Register for Event
```bash
POST /api/registrations
Authorization: Bearer <token>
Content-Type: application/json

{
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "ticketIds": ["660f9511-f40c-52e5-b827-557766551111"]
}
```

Response:
```json
{
  "id": "770a0622-g51d-63f6-c938-668877662222",
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "confirmed",
  "registrationDate": "2024-08-26T10:30:00Z",
  "checkInDate": null
}
```

### Check In to Event
```bash
POST /api/registrations/{registrationId}/checkin
Authorization: Bearer <token>
```

## Resale Marketplace API

### List Marketplace Tickets
```bash
GET /api/tickets/marketplace
Query Parameters:
  - eventId: uuid (optional)
  - minPrice: number
  - maxPrice: number
  - skip: number (default: 0)
  - take: number (default: 20)
```

Response:
```json
{
  "data": [
    {
      "id": "880b1733-h62e-74g7-d949-779988773333",
      "ticketId": "660f9511-f40c-52e5-b827-557766551111",
      "eventId": "550e8400-e29b-41d4-a716-446655440000",
      "sellPrice": "75.00",
      "maxPrice": "75.00",
      "listedDate": "2024-08-25T14:20:00Z",
      "sellerPublicKey": "GBXWWQZLJ2XDKUYKWZ2ZXNWP2D5V5JLPVFN4XKYPWPQXVPXWHGJ2PJQ"
    }
  ],
  "total": 42
}
```

### List Ticket for Resale
```bash
POST /api/tickets/{ticketId}/list-resale
Authorization: Bearer <token>
Content-Type: application/json

{
  "sellPrice": "65.00",
  "stellarSignature": "base64-encoded-ed25519-signature"
}
```

### Buy Resale Ticket
```bash
POST /api/tickets/marketplace/{resaleListingId}/purchase
Authorization: Bearer <token>
Content-Type: application/json

{
  "stellarSignature": "base64-encoded-ed25519-signature"
}
```

Response includes new ticket ownership, transaction details, and organizer fee breakdown.

## Pass Packages API

### List Pass Packages
```bash
GET /api/pass-packages
Query Parameters:
  - skip: number (default: 0)
  - take: number (default: 20)
```

Response:
```json
{
  "data": [
    {
      "id": "990c2844-i73f-85h8-e050-880099884444",
      "name": "Festival Pass 3 of 10",
      "description": "Entry to any 3 out of 10 summer festivals",
      "price": "120.00",
      "currency": "USD",
      "eventsAllowed": 3,
      "totalEvents": 10,
      "eventIds": ["id1", "id2", "id3", ...],
      "validUntil": "2024-12-31T23:59:59Z",
      "createdBy": "550e8400-e29b-41d4-a716-446655440000"
    }
  ]
}
```

### Create Pass Package (Organizer Only)
```bash
POST /api/pass-packages
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "VIP Venue Pass 5 of 8",
  "description": "Access to 5 events across our venue portfolio",
  "price": "250.00",
  "currency": "USD",
  "eventsAllowed": 5,
  "eventIds": [
    "550e8400-e29b-41d4-a716-446655440000",
    "660f9511-f40c-52e5-b827-557766551111",
    "770a0622-g51d-63f6-c938-668877662222",
    "880b1733-h62e-74g7-d949-779988773333",
    "990c2844-i73f-85h8-e050-880099884444",
    "aa0d3955-j84g-96i9-f161-991100995555",
    "bb1e4a66-k95h-a7j0-g272-aa2211aa6666",
    "cc2f5b77-l06i-b8k1-h383-bb3322bb7777"
  ],
  "validUntil": "2024-12-31T23:59:59Z"
}
```

### Purchase Pass Package
```bash
POST /api/pass-packages/{packageId}/purchase
Authorization: Bearer <token>
Content-Type: application/json

{
  "stellarSignature": "base64-encoded-ed25519-signature"
}
```

Response:
```json
{
  "id": "aa0d3955-j84g-96i9-f161-991100995555",
  "packageId": "990c2844-i73f-85h8-e050-880099884444",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "remainingAllowance": 5,
  "usedCount": 0,
  "purchaseDate": "2024-08-26T11:00:00Z",
  "expiryDate": "2024-12-31T23:59:59Z"
}
```

### Get Pass Balance
```bash
GET /api/pass-packages/{passId}/balance
Authorization: Bearer <token>
```

Response:
```json
{
  "passId": "aa0d3955-j84g-96i9-f161-991100995555",
  "remainingAllowance": 3,
  "usedCount": 2,
  "totalAllowance": 5,
  "validUntil": "2024-12-31T23:59:59Z"
}
```

### Check Pass Eligibility for Event
```bash
GET /api/pass-packages/{passId}/check-event/{eventId}
Authorization: Bearer <token>
```

Response:
```json
{
  "eligible": true,
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "remainingAllowance": 3,
  "eventTitle": "Summer Music Festival"
}
```

## Fraud Detection API

### Get Secondary Market Analytics (Admin/Organizer)
```bash
GET /api/fraud-detection/secondary-market-analytics/{eventId}
Authorization: Bearer <token>
Query Parameters:
  - startDate: ISO 8601 datetime
  - endDate: ISO 8601 datetime
```

Response:
```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "period": {
    "start": "2024-08-01T00:00:00Z",
    "end": "2024-08-26T23:59:59Z"
  },
  "tradingMetrics": {
    "totalTrades": 156,
    "totalVolume": "8450.00",
    "averagePrice": "54.10",
    "priceDeviation": 0.12,
    "velocityIndex": 2.4
  },
  "fraudIndicators": {
    "washTradesDetected": 3,
    "botActivityDetected": 2,
    "suspiciousPricingDetected": 5,
    "riskScore": 0.35
  },
  "flaggedTransactions": 7,
  "totalTransactions": 156
}
```

### Get Flagged Transactions
```bash
GET /api/fraud-detection/flagged-transactions
Authorization: Bearer <token>
Query Parameters:
  - status: pending|reviewed|cleared|confirmed_fraud
  - skip: number (default: 0)
  - take: number (default: 20)
```

Response:
```json
{
  "data": [
    {
      "id": "bb1e4a66-k95h-a7j0-g272-aa2211aa6666",
      "transactionHash": "xyz789abc",
      "sellerId": "550e8400-e29b-41d4-a716-446655440000",
      "buyerId": "660f9511-f40c-52e5-b827-557766551111",
      "salePrice": "150.00",
      "originalPrice": "50.00",
      "flagReason": "SUSPICIOUS_PRICING",
      "riskScore": 0.89,
      "status": "pending",
      "flaggedAt": "2024-08-26T09:15:00Z",
      "reviewNotes": null
    }
  ],
  "total": 7
}
```

### Review Flagged Transaction
```bash
PATCH /api/fraud-detection/flagged-transactions/{transactionId}/review
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "cleared",
  "notes": "Manual review confirms legitimate resale"
}
```

## Error Responses

All error responses follow this format:

```json
{
  "statusCode": 400,
  "message": "Invalid request parameters",
  "error": "Bad Request",
  "details": {
    "field": "ticketPrice",
    "issue": "must be a positive number"
  }
}
```

### Common Error Codes

- **400 Bad Request**: Invalid input parameters
- **401 Unauthorized**: Missing or invalid authentication token
- **403 Forbidden**: Insufficient permissions for requested action
- **404 Not Found**: Resource not found
- **409 Conflict**: Resource already exists or state conflict
- **422 Unprocessable Entity**: Validation failed
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Server error

## Rate Limiting

API requests are rate-limited per user:
- **Standard endpoints**: 100 requests per minute
- **Authentication endpoints**: 10 requests per minute
- **Marketplace endpoints**: 30 requests per minute

Rate limit info is included in response headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1693046400
```

## WebHooks

Organizers can subscribe to webhook events for their events.

### Webhook Events

- `event.created`
- `event.published`
- `event.cancelled`
- `ticket.purchased`
- `ticket.transferred`
- `ticket.refunded`
- `registration.confirmed`
- `registration.checkedIn`
- `resale.listed`
- `resale.purchased`
- `pass_package.purchased`
- `pass_package.used`
- `fraud.alert`

### Subscribe to Webhook
```bash
POST /api/webhooks
Authorization: Bearer <token>
Content-Type: application/json

{
  "url": "https://your-app.example.com/webhooks/lumentix",
  "events": ["ticket.purchased", "registration.confirmed"],
  "active": true
}
```

## Integration Examples

### CodeSandbox Examples

See interactive examples at: https://codesandbox.io/s/lumentix-api-examples

### cURL Example: List Events

```bash
curl -X GET "https://api.lumentix.com/api/events?take=5" \
  -H "Content-Type: application/json"
```

### Python Example: Purchase Ticket

```python
import requests

url = "https://api.lumentix.com/api/tickets/purchase"
headers = {
    "Authorization": "Bearer YOUR_JWT_TOKEN",
    "Content-Type": "application/json"
}
payload = {
    "eventId": "550e8400-e29b-41d4-a716-446655440000",
    "quantity": 2,
    "stellarSignature": "base64-encoded-signature"
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())
```

### JavaScript Example: Register for Event

```javascript
const apiUrl = 'https://api.lumentix.com/api/registrations';
const token = 'YOUR_JWT_TOKEN';

const registerEvent = async (eventId, ticketIds) => {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      eventId,
      ticketIds
    })
  });
  
  return response.json();
};
```

## Best Practices

1. **Always validate Stellar signatures** on the client side before sending to the API
2. **Use webhooks** instead of polling for real-time updates
3. **Handle rate limiting** with exponential backoff in retries
4. **Store JWT tokens securely** (never in localStorage for sensitive apps)
5. **Use event IDs consistently** across your application
6. **Implement user agent** headers in your requests for tracking
7. **Cache event listings** locally (TTL: 5 minutes recommended)
8. **Validate all input** before submitting to prevent XSS attacks

## Support

For API support and questions:
- Documentation: https://docs.lumentix.com
- Email: api-support@lumentix.com
- Discord: https://discord.gg/lumentix
