import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CapacityAlertLevel } from '../entities/venue-capacity-snapshot.entity';
import { SensorStatus, SensorType } from '../entities/iot-sensor.entity';

export class SensorSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: SensorType }) type: SensorType;
  @ApiProperty({ enum: SensorStatus }) status: SensorStatus;
  @ApiProperty() lastReading: number;
  @ApiPropertyOptional() lastReadingAt: Date | null;
  @ApiProperty() cumulativeEntries: number;
  @ApiProperty() cumulativeExits: number;
  @ApiPropertyOptional() sectionId: string | null;
  @ApiPropertyOptional() location: string | null;
}

export class CapacityMonitorDto {
  @ApiProperty({ description: 'Event UUID' })
  eventId: string;

  @ApiProperty({ description: 'Tickets sold (confirmed payments)' })
  ticketsSold: number;

  @ApiProperty({ description: 'Actual people physically inside (sensor-derived)' })
  actualOccupancy: number;

  @ApiProperty({ description: 'Configured hard capacity limit (null = unlimited)' })
  capacityLimit: number | null;

  @ApiProperty({ description: 'Occupancy as % of capacity limit' })
  occupancyPercent: number;

  @ApiProperty({ description: 'Remaining capacity before limit is hit' })
  remainingCapacity: number | null;

  @ApiProperty({ enum: CapacityAlertLevel })
  alertLevel: CapacityAlertLevel;

  @ApiProperty({ description: 'Number of active sensors' })
  activeSensorCount: number;

  @ApiProperty({ type: [SensorSummaryDto] })
  sensors: SensorSummaryDto[];

  @ApiPropertyOptional({ description: 'Per-section occupancy breakdown' })
  sectionBreakdown: Record<string, number> | null;

  @ApiProperty({ description: 'ISO timestamp of this reading' })
  timestamp: Date;
}

export class SpaceOptimisationDto {
  @ApiProperty({ description: 'Event UUID' })
  eventId: string;

  @ApiProperty({ description: 'Current occupancy percent' })
  occupancyPercent: number;

  @ApiProperty({ description: 'Alert level at time of analysis' })
  alertLevel: CapacityAlertLevel;

  @ApiProperty({ description: 'Actionable recommendations', type: [String] })
  recommendations: string[];

  @ApiProperty({ description: 'Per-section utilisation', type: Object })
  sectionUtilisation: Record<string, { occupancy: number; capacity: number; utilisationPercent: number }>;

  @ApiProperty({ description: 'Suggested capacity rebalancing actions', type: [String] })
  rebalancingActions: string[];

  @ApiProperty({ description: 'Estimated time to reach critical threshold (minutes), null if not trending there' })
  estimatedMinutesToCritical: number | null;
}

export class CapacityUpdateResultDto {
  @ApiProperty({ description: 'Updated capacity limit' })
  newLimit: number | null;

  @ApiProperty({ description: 'Previous capacity limit' })
  previousLimit: number | null;

  @ApiProperty({ description: 'Whether ticket sales were paused' })
  salesPaused: boolean;

  @ApiProperty({ description: 'Audit log entry ID' })
  auditId: string;
}
