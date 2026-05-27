import { ApiProperty } from '@nestjs/swagger';

export class AttendanceDataPoint {
  @ApiProperty({ description: 'Time of check-in' })
  timestamp: Date;

  @ApiProperty({ description: 'Number of attendees checked in at this time' })
  checkInCount: number;

  @ApiProperty({ description: 'Cumulative attendees checked in up to this time' })
  cumulativeCheckIns: number;

  @ApiProperty({ description: 'Hour of day (0-23)' })
  hour: number;
}

export class AttendanceMetrics {
  @ApiProperty({ description: 'Peak check-in hour (0-23)' })
  peakCheckInHour: number | null;

  @ApiProperty({ description: 'Number of attendees checked in during peak hour' })
  peakCheckInCount: number;

  @ApiProperty({ description: 'Total attendees checked in' })
  totalCheckIns: number;

  @ApiProperty({ description: 'Percentage of tickets that were used' })
  attendanceRate: number;

  @ApiProperty({ description: 'Average time between check-ins (in minutes)' })
  avgCheckInInterval: number | null;

  @ApiProperty({ description: 'Check-ins per minute at peak' })
  peakCheckInRate: number | null;

  @ApiProperty({
    description: 'Estimated total attendance capacity filled',
  })
  estimatedCapacityFilled: number | null;
}

export class AttendancePatternDto {
  @ApiProperty({ description: 'Time period covered (in hours)' })
  eventDurationHours: number;

  @ApiProperty({ type: [AttendanceDataPoint], description: 'Hourly check-in data' })
  hourlyCheckIns: AttendanceDataPoint[];

  @ApiProperty({ type: AttendanceMetrics })
  metrics: AttendanceMetrics;

  @ApiProperty({ description: 'Total tickets issued for the event' })
  totalTicketsIssued: number;

  @ApiProperty({ description: 'Number of tickets used/checked in' })
  ticketsUsed: number;

  @ApiProperty({ description: 'Number of tickets not used' })
  ticketsUnused: number;

  @ApiProperty({ description: 'Time event started' })
  eventStartTime: Date;

  @ApiProperty({ description: 'Time of last check-in' })
  lastCheckInTime: Date | null;
}
