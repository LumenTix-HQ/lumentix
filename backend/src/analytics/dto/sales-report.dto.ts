import { ApiProperty } from '@nestjs/swagger';

export class SalesDataPoint {
  @ApiProperty({ description: 'Timestamp for the data point' })
  timestamp: Date;

  @ApiProperty({ description: 'Number of tickets sold at this timestamp' })
  ticketsSold: number;

  @ApiProperty({ description: 'Revenue amount (in currency units)' })
  revenue: number;

  @ApiProperty({ description: 'Cumulative tickets sold up to this point' })
  cumulativeTickets: number;

  @ApiProperty({ description: 'Cumulative revenue up to this point' })
  cumulativeRevenue: number;
}

export class SalesVelocityMetrics {
  @ApiProperty({ description: 'Average tickets sold per day' })
  avgTicketsPerDay: number;

  @ApiProperty({ description: 'Average revenue per day' })
  avgRevenuePerDay: number;

  @ApiProperty({ description: 'Tickets sold in the last 7 days' })
  ticketsLast7Days: number;

  @ApiProperty({ description: 'Tickets sold in the last 24 hours' })
  ticketsLast24Hours: number;

  @ApiProperty({ description: 'Peak sales hour (0-23)' })
  peakSalesHour: number | null;

  @ApiProperty({ description: 'Peak sales day of week (0-6, Sunday-Saturday)' })
  peakSalesDayOfWeek: number | null;

  @ApiProperty({ description: 'Sales trend (increasing, decreasing, stable)' })
  trend: 'increasing' | 'decreasing' | 'stable';
}

export class SalesReportDto {
  @ApiProperty({
    type: [SalesDataPoint],
    description: 'Sales data points over time',
  })
  salesData: SalesDataPoint[];

  @ApiProperty({ type: SalesVelocityMetrics })
  metrics: SalesVelocityMetrics;

  @ApiProperty({ description: 'Total tickets sold' })
  totalTicketsSold: number;

  @ApiProperty({ description: 'Total revenue' })
  totalRevenue: number;

  @ApiProperty({ description: 'Average ticket price' })
  avgTicketPrice: number;

  @ApiProperty({ description: 'Time period covered (in days)' })
  daysActive: number;
}
