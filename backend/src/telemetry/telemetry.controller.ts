import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TelemetryService } from './telemetry.service';
import { RecordMetricDto } from './dto/record-metric.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Telemetry & Monitoring')
@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Post('metrics')
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Record a metric datapoint',
    description: 'Admin-only. Records a system telemetry metric (API latency, error rate, etc).',
  })
  @ApiResponse({ status: 201, description: 'Metric recorded' })
  async recordMetric(@Body() dto: RecordMetricDto) {
    return this.telemetryService.recordMetric(dto);
  }

  @Get('health')
  @ApiOperation({
    summary: 'Get system health status',
    description: 'Returns overall platform health based on recent metrics.',
  })
  @ApiResponse({ status: 200, description: 'Health status' })
  async getHealth() {
    return this.telemetryService.pingSystemServices();
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Fetch telemetry status',
    description: 'Admin-only. Returns detailed telemetry metrics from the specified time window.',
  })
  @ApiResponse({ status: 200, description: 'Telemetry data' })
  async getTelemetryStatus(
    @Query('metricType') metricType?: string,
    @Query('service') service?: string,
    @Query('hoursBack', { transform: (v) => parseInt(v, 10) }) hoursBack: number = 1,
  ) {
    return this.telemetryService.fetchTelemetryStatus(
      metricType as any,
      service,
      hoursBack,
    );
  }
}
