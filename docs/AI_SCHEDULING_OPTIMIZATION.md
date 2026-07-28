# AI-Powered Event Scheduling Optimization

This feature uses machine learning and historical data analysis to optimize event scheduling for maximum attendance and revenue.

## Features

### 1. Optimal Timing Analysis (`analyze_optimal_timing`)

Analyzes historical data, seasonal patterns, competition, and demographic factors to recommend the best time for your event.

**Endpoint:** `POST /scheduling/analyze-optimal-timing`

**Request:**
```json
{
  "category": "CONFERENCE",
  "location": "San Francisco",
  "duration": 2,
  "targetAudience": "professionals"
}
```

**Response:**
```json
{
  "recommendedStartDate": "2024-06-15T18:00:00Z",
  "recommendedEndDate": "2024-06-15T20:00:00Z",
  "confidence": 0.87,
  "factors": {
    "seasonalScore": 0.92,
    "competitionScore": 0.85,
    "demographicScore": 0.88,
    "historicalPerformance": 0.83
  },
  "reasoning": [
    "June shows highest historical attendance for tech events",
    "Low competition period identified",
    "Optimized for professionals preferences",
    "Weekend evening slot maximizes attendance"
  ]
}
```

### 2. Schedule Suggestions (`suggest_event_schedule`)

Generates multiple scheduling options ranked by expected performance within a specified date range.

**Endpoint:** `POST /scheduling/suggest-schedule`

**Request:**
```json
{
  "category": "WORKSHOP",
  "location": "Austin",
  "duration": 3,
  "dateRange": {
    "start": "2024-06-01T00:00:00Z",
    "end": "2024-06-30T23:59:59Z"
  }
}
```

**Response:**
```json
[
  {
    "timeSlot": {
      "startDate": "2024-06-15T18:00:00Z",
      "endDate": "2024-06-15T21:00:00Z"
    },
    "expectedAttendance": 150,
    "revenueProjection": 7500,
    "competitionLevel": "low",
    "seasonalFactor": 1.2,
    "confidence": 0.89
  }
]
```

### 3. Attendance Impact Prediction (`predict_attendance_impact`)

Predicts how changing an event's schedule will impact attendance and revenue.

**Endpoint:** `POST /scheduling/predict-attendance-impact/:eventId`

**Request:**
```json
{
  "newStartDate": "2024-07-15T19:00:00Z",
  "newEndDate": "2024-07-15T22:00:00Z"
}
```

**Response:**
```json
{
  "baselineAttendance": 120,
  "projectedAttendance": 145,
  "impactFactors": {
    "timeOfYear": 1.1,
    "dayOfWeek": 1.2,
    "timeOfDay": 1.3,
    "competition": 0.9,
    "demographics": 1.0
  },
  "riskFactors": [
    "High competition from similar events"
  ],
  "opportunities": [
    "Weekend scheduling advantage",
    "Peak seasonal demand period"
  ]
}
```

## Algorithm Components

### Seasonal Analysis
- Analyzes historical attendance patterns by month
- Identifies peak and low seasons for different event categories
- Calculates seasonal multipliers for attendance prediction

### Competition Analysis
- Identifies competing events in the same category and location
- Calculates competition density for different time periods
- Provides competition level ratings (low/medium/high)

### Demographic Optimization
- Considers target audience preferences for timing
- Optimizes for different demographic groups:
  - **Young Adults**: Prefer weekends and evenings
  - **Families**: Prefer weekends and afternoons
  - **Professionals**: Prefer weekdays and evenings
  - **Seniors**: Prefer weekdays and mornings

### Historical Performance
- Analyzes past event success metrics
- Considers attendance rates, revenue, and satisfaction scores
- Builds predictive models based on similar events

## Confidence Scoring

The system provides confidence scores (0-1) based on:
- **Data Quality**: Amount of historical data available
- **Pattern Consistency**: How consistent seasonal patterns are
- **Market Stability**: How predictable the local event market is

## Usage Examples

### Frontend Integration

```typescript
import { schedulingService } from '@/lib/scheduling';

// Analyze optimal timing
const analysis = await schedulingService.analyzeOptimalTiming({
  category: 'CONFERENCE',
  location: 'San Francisco',
  duration: 2,
  targetAudience: 'professionals'
});

// Get schedule suggestions
const suggestions = await schedulingService.suggestEventSchedule({
  category: 'WORKSHOP',
  location: 'Austin',
  duration: 3,
  dateRange: {
    start: '2024-06-01T00:00:00Z',
    end: '2024-06-30T23:59:59Z'
  }
});
```

### Backend Service Usage

```typescript
import { SchedulingService } from './scheduling.service';

@Injectable()
export class EventService {
  constructor(private schedulingService: SchedulingService) {}

  async createOptimizedEvent(eventData: CreateEventDto) {
    // Get optimal timing recommendation
    const timing = await this.schedulingService.analyzeOptimalTiming(
      eventData.category,
      eventData.location,
      eventData.duration,
      eventData.targetAudience
    );

    // Use recommended timing for event creation
    const optimizedEvent = {
      ...eventData,
      startDate: timing.recommendedStartDate,
      endDate: timing.recommendedEndDate
    };

    return this.createEvent(optimizedEvent);
  }
}
```

## Performance Factors

### Time-based Factors
- **Day of Week**: Weekends typically see 60% higher attendance
- **Time of Day**: Evening events (6-8 PM) perform best for professionals
- **Season**: Spring and fall optimal for outdoor events
- **Holidays**: Major holidays reduce attendance by 40-70%

### Market Factors
- **Competition**: Each competing event reduces attendance by 15-25%
- **Local Events**: Major local events can impact attendance by 30%
- **Economic Conditions**: Economic downturns reduce paid event attendance

### Demographic Factors
- **Age Groups**: Different preferences for timing and duration
- **Professional Status**: Working professionals prefer evenings/weekends
- **Family Status**: Families prefer family-friendly time slots

## Best Practices

1. **Use Historical Data**: The more historical data available, the more accurate predictions become
2. **Consider Local Context**: Factor in local holidays, cultural events, and seasonal patterns
3. **Monitor Competition**: Regularly check for competing events in your category
4. **Test Recommendations**: A/B test different time slots to validate AI recommendations
5. **Update Regularly**: Retrain models with new event data to improve accuracy

## API Rate Limits

- **Analyze Optimal Timing**: 10 requests per minute
- **Schedule Suggestions**: 5 requests per minute  
- **Attendance Prediction**: 20 requests per minute

## Error Handling

The API returns standard HTTP status codes:
- `200`: Success
- `400`: Bad Request (invalid parameters)
- `401`: Unauthorized (missing/invalid token)
- `404`: Not Found (event not found)
- `429`: Too Many Requests (rate limit exceeded)
- `500`: Internal Server Error

## Future Enhancements

- **Weather Integration**: Factor in weather forecasts for outdoor events
- **Social Media Sentiment**: Analyze social media buzz around competing events
- **Dynamic Pricing**: Integrate with pricing optimization based on demand predictions
- **Multi-city Analysis**: Cross-city event impact analysis
- **Real-time Adjustments**: Continuous learning from ongoing events
