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
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ScanAnalyticsService } from './scan-analytics.service';
import { RecordScanDto, FetchRealtimeScanSpeedDto } from './dto/record-scan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Scan Analytics')
@Controller('events/:eventId/scan-analytics')
export class ScanAnalyticsController {
  constructor(private readonly scanService: ScanAnalyticsService) {}

  @Post('record-scan')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Record a ticket scan',
    description: 'Records a ticket scan event with timing and success status.',
  })
  @ApiResponse({ status: 201, description: 'Scan recorded' })
  async recordScan(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: RecordScanDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.scanService.recordScan(dto);
  }

  @Get('scan-velocity')
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Calculate scan velocity',
    description:
      'Organizer-only. Returns the scans per minute for the event or specific gate.',
  })
  @ApiResponse({ status: 200, description: 'Scan velocity' })
  async getScanVelocity(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query('gateId') gateId?: string,
  ) {
    const velocity = await this.scanService.calculateScanVelocity(
      eventId,
      gateId,
    );
    return { eventId, gateId: gateId || null, scansPerMinute: velocity };
  }

  @Get('throughput')
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Track gate throughput',
    description:
      'Organizer-only. Returns queue velocity stats for staffing optimization.',
  })
  @ApiResponse({ status: 200, description: 'Throughput statistics' })
  async getGateThroughput(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query('gateId') gateId?: string,
  ) {
    return this.scanService.trackGateThroughput(eventId, gateId);
  }

  @Get('realtime-speed')
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Fetch realtime scan speed',
    description:
      'Organizer-only. Returns recent scan metrics for dashboard display.',
  })
  @ApiResponse({ status: 200, description: 'Scan metrics' })
  async getRealtimeScanSpeed(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query('gateId') gateId?: string,
    @Query('minutesBack', { transform: (v) => parseInt(v, 10) })
    minutesBack: number = 5,
  ) {
    return this.scanService.fetchRealtimeScanSpeed(
      eventId,
      gateId,
      minutesBack,
    );
  }
}
