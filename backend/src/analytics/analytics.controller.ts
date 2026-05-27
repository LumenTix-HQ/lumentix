import {
  Controller,
  Get,
  Param,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { SalesReportDto } from './dto/sales-report.dto';
import { DemographicsReportDto } from './dto/demographic-report.dto';
import { AttendancePatternDto } from './dto/attendance-pattern.dto';
import { AnalyticsDashboardDto } from './dto/analytics-dashboard.dto';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiResponse({ status: 429, description: 'Too Many Requests' })
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('events/:eventId/dashboard')
  @Roles(Role.ORGANIZER)
  @ApiOperation({
    summary: 'Get comprehensive analytics dashboard',
    description:
      'Organizer-only. Returns complete analytics including sales, demographics, attendance, and refunds.',
  })
  @ApiResponse({
    status: 200,
    description: 'Analytics dashboard data',
    type: AnalyticsDashboardDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async getDashboard(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<AnalyticsDashboardDto> {
    return this.analyticsService.generateAnalyticsDashboard(
      eventId,
      req.user.id,
    );
  }

  @Get('events/:eventId/sales-report')
  @Roles(Role.ORGANIZER)
  @ApiOperation({
    summary: 'Generate sales velocity report',
    description:
      'Organizer-only. Provides sales data over time, velocity metrics, and trends.',
  })
  @ApiResponse({
    status: 200,
    description: 'Sales report with velocity metrics',
    type: SalesReportDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async generateSalesReport(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<SalesReportDto> {
    return this.analyticsService.generateSalesReport(eventId, req.user.id);
  }

  @Get('events/:eventId/demographics')
  @Roles(Role.ORGANIZER)
  @ApiOperation({
    summary: 'Get demographic analytics',
    description:
      'Organizer-only. Provides age distribution, currency breakdown, and repeat attendee data.',
  })
  @ApiResponse({
    status: 200,
    description: 'Demographic report',
    type: DemographicsReportDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async trackDemographicData(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<DemographicsReportDto> {
    return this.analyticsService.trackDemographicData(eventId, req.user.id);
  }

  @Get('events/:eventId/attendance')
  @Roles(Role.ORGANIZER)
  @ApiOperation({
    summary: 'Analyze attendance patterns',
    description:
      'Organizer-only. Provides check-in data, peak hours, and attendance metrics.',
  })
  @ApiResponse({
    status: 200,
    description: 'Attendance pattern data',
    type: AttendancePatternDto,
    isArray: false,
  })
  @ApiResponse({
    status: 204,
    description: 'No check-in data available yet',
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async analyzeAttendancePatterns(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<AttendancePatternDto | null> {
    return this.analyticsService.analyzeAttendancePatterns(
      eventId,
      req.user.id,
    );
  }
}
