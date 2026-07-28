import { ApiProperty } from '@nestjs/swagger';
import { AnalyticsDashboardDto } from './analytics-dashboard.dto';

export class MarketTrendPointDto {
  @ApiProperty()
  period: string;

  @ApiProperty()
  eventsCount: number;

  @ApiProperty()
  ticketsSold: number;

  @ApiProperty()
  revenue: number;

  @ApiProperty()
  avgTicketPrice: number;
}

export class MarketTrendsDto {
  @ApiProperty()
  category: string;

  @ApiProperty()
  location: string;

  @ApiProperty({ enum: ['rising', 'stable', 'declining'] })
  demandTrend: 'rising' | 'stable' | 'declining';

  @ApiProperty()
  competitionLevel: 'low' | 'medium' | 'high';

  @ApiProperty()
  seasonalFactor: number;

  @ApiProperty({ type: [MarketTrendPointDto] })
  monthlyTrends: MarketTrendPointDto[];

  @ApiProperty()
  insights: string[];
}

export class BusinessOutcomePredictionDto {
  @ApiProperty()
  eventId: string;

  @ApiProperty()
  projectedRevenue: number;

  @ApiProperty()
  projectedAttendance: number;

  @ApiProperty()
  projectedSellThroughPercent: number;

  @ApiProperty()
  projectedRefundRatePercent: number;

  @ApiProperty({ enum: ['low', 'medium', 'high'] })
  confidence: 'low' | 'medium' | 'high';

  @ApiProperty()
  recommendations: string[];
}

export class BiDashboardDto {
  @ApiProperty()
  organizerId: string;

  @ApiProperty()
  generatedAt: Date;

  @ApiProperty()
  portfolioSummary: {
    totalEvents: number;
    activeEvents: number;
    totalRevenue: number;
    totalTicketsSold: number;
    avgSellThroughPercent: number;
  };

  @ApiProperty({ type: AnalyticsDashboardDto, nullable: true })
  featuredEvent: AnalyticsDashboardDto | null;

  @ApiProperty({ type: MarketTrendsDto })
  marketTrends: MarketTrendsDto;

  @ApiProperty({ type: BusinessOutcomePredictionDto, nullable: true })
  predictions: BusinessOutcomePredictionDto | null;
}
