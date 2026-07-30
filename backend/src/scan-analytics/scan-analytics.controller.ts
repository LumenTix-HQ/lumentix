import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ScanAnalyticsService } from './scan-analytics.service';
import { RecordGateScanDto } from './dto/record-gate-scan.dto';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Gate Scan Analytics')
@ApiBearerAuth()
@Controller('events/:eventId/scan-analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiResponse({ status: 401, description: 'Unauthorized' })
@ApiResponse({ status: 403, description: 'Forbidden' })
export class ScanAnalyticsController {
  constructor(private readonly scanAnalyticsService: ScanAnalyticsService) {}

  @Post('scans')
  @Roles(Role.ORGANIZER, Role.ADMIN)
  @ApiOperation({ summary: 'Record a gate scan', description: 'Organizer/Admin-only. Logs a check-in scan event for a gate.' })
  @ApiResponse({ status: 201, description: 'Scan event recorded' })
  recordScan(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: RecordGateScanDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.scanAnalyticsService.recordGateScan(eventId, dto, req.user.id);
  }

  @Get('velocity')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Calculate scan velocity', description: 'Organizer-only. Scans-per-minute over a configurable window, optionally scoped to a single gate.' })
  @ApiQuery({ name: 'gateId', required: false })
  @ApiQuery({ name: 'windowMinutes', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Scan velocity result' })
  calculateVelocity(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
    @Query('gateId') gateId?: string,
    @Query('windowMinutes') windowMinutes?: string,
  ) {
    return this.scanAnalyticsService.calculateScanVelocity(
      eventId,
      req.user.id,
      gateId,
      windowMinutes ? Number(windowMinutes) : undefined,
    );
  }

  @Get('throughput')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Track gate throughput', description: 'Organizer-only. Per-gate scan throughput to help optimize staffing.' })
  @ApiQuery({ name: 'windowMinutes', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Per-gate throughput stats' })
  trackThroughput(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
    @Query('windowMinutes') windowMinutes?: string,
  ) {
    return this.scanAnalyticsService.trackGateThroughput(
      eventId,
      req.user.id,
      windowMinutes ? Number(windowMinutes) : undefined,
    );
  }

  @Get('realtime')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Fetch real-time scan speed', description: 'Organizer-only. Live scans-per-minute over the last 60 seconds.' })
  @ApiQuery({ name: 'gateId', required: false })
  @ApiResponse({ status: 200, description: 'Real-time scan speed' })
  fetchRealtimeSpeed(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
    @Query('gateId') gateId?: string,
  ) {
    return this.scanAnalyticsService.fetchRealtimeScanSpeed(eventId, req.user.id, gateId);
  }
}
