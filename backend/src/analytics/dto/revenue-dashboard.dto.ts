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

export class RevenueBreakdownRow {
  @ApiProperty({ example: 'VIP' })
  name: string;

  @ApiProperty({ example: 12 })
  quantity: number;

  @ApiProperty({ example: 240 })
  revenue: number;
}

export class RevenueReportDto {
  @ApiProperty({ example: 'event-1' })
  eventId: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  startDate: string | null;

  @ApiProperty({ example: '2026-01-31T23:59:59.999Z' })
  endDate: string | null;

  @ApiProperty({ example: 2400 })
  totalRevenue: number;

  @ApiProperty({ example: 100 })
  ticketRevenue: number;

  @ApiProperty({ example: 80 })
  merchRevenue: number;

  @ApiProperty({ example: 20 })
  ticketCount: number;

  @ApiProperty({ type: [RevenueBreakdownRow] })
  ticketTiers: RevenueBreakdownRow[];

  @ApiProperty({ type: [RevenueBreakdownRow] })
  promoCodes: RevenueBreakdownRow[];

  @ApiProperty({ type: [RevenueBreakdownRow] })
  merchSales: RevenueBreakdownRow[];

  @ApiProperty({ type: [RevenueTimePoint] })
  timeSeries: RevenueTimePoint[];
}
