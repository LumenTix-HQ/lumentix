import { ApiProperty } from '@nestjs/swagger';
import { SalesReportDto } from './sales-report.dto';
import { DemographicsReportDto } from './demographic-report.dto';
import { AttendancePatternDto } from './attendance-pattern.dto';

export class RefundMetrics {
  @ApiProperty({ description: 'Total number of refunds' })
  totalRefunds: number;

  @ApiProperty({ description: 'Total refund amount' })
  totalRefundAmount: number;

  @ApiProperty({ description: 'Refund rate as percentage of total sales' })
  refundRate: number;

  @ApiProperty({ description: 'Average refund amount' })
  avgRefundAmount: number;

  @ApiProperty({
    description: 'Most common reason for refunds',
    nullable: true,
  })
  mostCommonReason: string | null;

  @ApiProperty({ description: 'Refunds in last 7 days' })
  refundsLast7Days: number;
}

export class QuickStats {
  @ApiProperty({ description: 'Total tickets sold' })
  ticketsSold: number;

  @ApiProperty({ description: 'Total revenue' })
  totalRevenue: number;

  @ApiProperty({ description: 'Current attendance count' })
  attendanceCount: number;

  @ApiProperty({ description: 'Attendance rate percentage' })
  attendanceRate: number;

  @ApiProperty({ description: 'Average ticket price' })
  avgTicketPrice: number;

  @ApiProperty({ description: 'Total refunds' })
  totalRefunds: number;

  @ApiProperty({ description: 'Refund rate percentage' })
  refundRate: number;

  @ApiProperty({ description: 'Revenue trend (up, down, stable)' })
  revenueTrend: 'up' | 'down' | 'stable';

  @ApiProperty({ description: 'Sales trend (up, down, stable)' })
  salesTrend: 'up' | 'down' | 'stable';
}

export class AnalyticsDashboardDto {
  @ApiProperty({ description: 'Event ID' })
  eventId: string;

  @ApiProperty({ description: 'Dashboard last updated at' })
  lastUpdated: Date;

  @ApiProperty({ type: QuickStats })
  quickStats: QuickStats;

  @ApiProperty({ type: SalesReportDto })
  salesReport: SalesReportDto;

  @ApiProperty({ type: DemographicsReportDto })
  demographics: DemographicsReportDto;

  @ApiProperty({ type: AttendancePatternDto, nullable: true })
  attendance: AttendancePatternDto | null;

  @ApiProperty({ type: RefundMetrics })
  refunds: RefundMetrics;
}
