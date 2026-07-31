import { ApiProperty } from '@nestjs/swagger';

export class CurrencyRevenue {
  @ApiProperty({ example: 'XLM' })
  currency: string;

  @ApiProperty({ example: 120 })
  ticketCount: number;

  @ApiProperty({ example: 2400.5 })
  totalAmount: number;

  @ApiProperty({ example: 20.0042 })
  avgPrice: number;
}

export class RevenueTimePoint {
  @ApiProperty({ example: '2025-06-01T00:00:00.000Z' })
  date: string;

  @ApiProperty({ example: 5 })
  ticketsSold: number;

  @ApiProperty({ example: 100.25 })
  revenue: number;
}

export class RevenueDashboardDto {
  @ApiProperty({ description: 'Event ID' })
  eventId: string;

  @ApiProperty({ example: 4800.75 })
  totalRevenue: number;

  @ApiProperty({ example: 240 })
  ticketCount: number;

  @ApiProperty({ example: 20.0031 })
  averagePrice: number;

  @ApiProperty({ type: [CurrencyRevenue], description: 'Revenue breakdown by currency' })
  currencyBreakdown: CurrencyRevenue[];

  @ApiProperty({ type: [RevenueTimePoint], description: 'Daily revenue time-series' })
  timeSeries: RevenueTimePoint[];

  @ApiProperty({ example: '2025-07-01T12:00:00.000Z' })
  generatedAt: string;
}
