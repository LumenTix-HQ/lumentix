import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TelemetryService } from './telemetry.service';
import { RecordMetricDatapointDto } from './dto/record-metric-datapoint.dto';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Telemetry')
@ApiBearerAuth()
@Controller('telemetry')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiResponse({ status: 401, description: 'Unauthorized' })
@ApiResponse({ status: 403, description: 'Forbidden' })
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Fetch platform telemetry status',
    description: 'Admin-only. Returns node ping results, average latency, uptime percentage, and recent datapoints.',
  })
  @ApiResponse({ status: 200, description: 'Telemetry status summary' })
  fetchStatus() {
    return this.telemetryService.fetchTelemetryStatus();
  }

  @Post('ping')
  @ApiOperation({
    summary: 'Ping system services',
    description: 'Admin-only. Pings the database, Redis, and Stellar Horizon, recording latency datapoints.',
  })
  @ApiResponse({ status: 201, description: 'Ping results for all monitored services' })
  ping() {
    return this.telemetryService.pingSystemServices();
  }

  @Post('metrics')
  @ApiOperation({
    summary: 'Record a telemetry metric datapoint',
    description: 'Admin-only. Persists a custom telemetry datapoint for dashboards.',
  })
  @ApiResponse({ status: 201, description: 'Metric datapoint recorded' })
  recordMetric(@Body() dto: RecordMetricDatapointDto) {
    return this.telemetryService.recordMetricDatapoint(dto);
  }
}
