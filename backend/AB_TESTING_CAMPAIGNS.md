# A/B Testing for Email Campaigns

## Overview
This feature enables organizers to create A/B test variants of email campaigns with configurable audience splits and automatic winner selection based on open/click rates.

## Functions Implemented

### 1. `create_ab_test_variant(campaignId, dto, requesterId)`
Creates a new variant for A/B testing:
- Label: Variant identifier (e.g., "Variant A")
- Subject: Email subject line
- Body: Email content (HTML)

### 2. `split_audience(campaignId, dto, requesterId)`
Distributes recipients across variants and sends emails:
- Configurable weight distribution (e.g., 60/40 split)
- Deterministic assignment algorithm
- Automatic email queuing per recipient
- Updates variant sent counts

### 3. `select_winning_variant(campaignId, requesterId)`
Automatically selects the best performing variant:
- Scoring formula: `score = (clickRate × 0.7) + (openRate × 0.3)`
- Click rate weighted 70% (stronger engagement signal)
- Open rate weighted 30% (secondary signal)
- Returns winner with performance metrics

## Workflow

```
1. Create Campaign (draft status)
   ↓
2. Add Variants A & B (different subject/body)
   ↓
3. Split Audience (60/40 distribution)
   ↓
4. Send Emails (automatic queuing)
   ↓
5. Track Engagement (opens & clicks)
   ↓
6. Select Winner (automatic based on score)
   ↓
7. Campaign Completed
```

## API Endpoints

```http
# Create campaign
POST /api/campaigns
Body: { "name": "Summer Sale", "eventId": "event-123" }

# Create variant
POST /api/campaigns/:id/variants
Body: { "label": "Variant A", "subject": "...", "body": "..." }

# List variants
GET /api/campaigns/:id/variants

# Split audience and send
POST /api/campaigns/:id/split-audience
Body: { 
  "recipientUserIds": ["user1", "user2"],
  "variantWeights": { "variant-a-id": 60, "variant-b-id": 40 }
}

# Select winner
POST /api/campaigns/:id/select-winner

# Track open (pixel)
GET /api/campaigns/track/open/:recipientId

# Track click
GET /api/campaigns/track/click/:recipientId
```

## Data Structures

### Campaign
```typescript
{
  id: string;
  organizerId: string;
  eventId: string | null;
  name: string;
  status: 'draft' | 'testing' | 'completed';
  winningVariantId: string | null;
}
```

### Variant
```typescript
{
  id: string;
  campaignId: string;
  label: string;
  subject: string;
  body: string;
  sentCount: number;
  openCount: number;
  clickCount: number;
}
```

### Recipient
```typescript
{
  id: string;
  campaignId: string;
  variantId: string;
  userId: string;
  openedAt: Date | null;
  clickedAt: Date | null;
}
```

## Scoring Algorithm

```typescript
// Winner selection formula
const openRate = openCount / sentCount;
const clickRate = clickCount / sentCount;
const score = (clickRate * 0.7) + (openRate * 0.3);

// Best variant = highest score
```

**Rationale:**
- Clicks indicate stronger engagement (70% weight)
- Opens provide secondary signal (30% weight)
- Simple, interpretable metric for decision making

## Audience Split Algorithm

```typescript
// Deterministic position-based assignment
const totalWeight = sum(weights);
const position = (recipientIndex / totalRecipients) * totalWeight;
const variantIndex = findThresholdIndex(position, cumulativeWeights);
```

**Features:**
- No randomness = reproducible results
- Respects weight ratios precisely
- Stable assignment across runs

## Tracking Implementation

### Open Tracking
Embed 1x1 pixel in email:
```html
<img src="https://api.example.com/campaigns/track/open/RECIPIENT_ID" 
     width="1" height="1" style="display:none" />
```

### Click Tracking
Wrap links with tracking redirect:
```html
<a href="https://api.example.com/campaigns/track/click/RECIPIENT_ID?redirect=https://event.com">
  Click here
</a>
```

## Security

- Campaign ownership validation
- Only draft campaigns can add variants
- Recipient validation before sending
- No duplicate sends to same recipient
- Tracking endpoints are public but require valid UUID

## Performance

- Batch recipient processing
- Async email queuing (non-blocking)
- Minimal database locking
- Optimistic updates for metrics

## Usage Example

```typescript
// 1. Create campaign
const campaign = await campaignsService.createCampaign(
  { name: 'Summer Sale', eventId: 'event-123' },
  organizerId
);

// 2. Add variants
const variantA = await campaignsService.create_ab_test_variant(
  campaign.id,
  { label: 'A', subject: 'Limited Time!', body: '<p>...</p>' },
  organizerId
);

const variantB = await campaignsService.create_ab_test_variant(
  campaign.id,
  { label: 'B', subject: 'Exclusive Access', body: '<p>...</p>' },
  organizerId
);

// 3. Split and send
const result = await campaignsService.split_audience(
  campaign.id,
  {
    recipientUserIds: ['user1', 'user2', 'user3'],
    variantWeights: { [variantA.id]: 60, [variantB.id]: 40 }
  },
  organizerId
);

// 4. Wait for engagement...

// 5. Select winner
const winner = await campaignsService.select_winning_variant(
  campaign.id,
  organizerId
);

console.log(`Winner: ${winner.winner.label}`);
console.log(`Score: ${winner.scores.find(s => s.variantId === winner.winner.id).score}`);
```

## Testing

```bash
# Create campaign
curl -X POST -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Campaign","eventId":null}' \
  http://localhost:3000/api/campaigns

# Add variant
curl -X POST -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"label":"A","subject":"Subject A","body":"<p>Body A</p>"}' \
  http://localhost:3000/api/campaigns/CAMPAIGN_ID/variants

# Split audience
curl -X POST -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipientUserIds":["user1","user2"],
    "variantWeights":{"VARIANT_A_ID":60,"VARIANT_B_ID":40}
  }' \
  http://localhost:3000/api/campaigns/CAMPAIGN_ID/split-audience

# Select winner
curl -X POST -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/campaigns/CAMPAIGN_ID/select-winner
```

## Database Tables

### email_campaigns
- id (UUID, PK)
- organizerId (UUID, FK)
- eventId (UUID, FK, nullable)
- name (VARCHAR)
- status (VARCHAR)
- winningVariantId (UUID, FK, nullable)
- createdAt (TIMESTAMP)

### email_campaign_variants
- id (UUID, PK)
- campaignId (UUID, FK)
- label (VARCHAR)
- subject (VARCHAR)
- body (TEXT)
- sentCount (INT)
- openCount (INT)
- clickCount (INT)
- createdAt (TIMESTAMP)

### email_campaign_recipients
- id (UUID, PK)
- campaignId (UUID, FK)
- variantId (UUID, FK)
- userId (UUID, FK)
- openedAt (TIMESTAMP, nullable)
- clickedAt (TIMESTAMP, nullable)
- createdAt (TIMESTAMP)

## Benefits

- 📊 **Data-driven**: Make decisions based on actual engagement
- ⚡ **Automated**: Winner selection requires no manual analysis
- 🎯 **Targeted**: Split audience by custom weights
- 📈 **Optimized**: Improve email performance over time
- 🔍 **Transparent**: Full metrics visibility per variant

## Best Practices

1. **Test Significantly Different Content**: Make variants distinct enough to measure impact
2. **Use Sufficient Sample Size**: At least 100 recipients per variant recommended
3. **Wait for Engagement**: Allow 24-48 hours before selecting winner
4. **Track Both Metrics**: Opens show reach, clicks show intent
5. **Document Learnings**: Use insights to inform future campaigns
