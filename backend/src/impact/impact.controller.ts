import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiProduces,
} from '@nestjs/swagger';
import { ImpactService } from './impact.service';
import { MeasureEventImpactDto } from './dto/measure-event-impact.dto';
import { GenerateImpactReportDto } from './dto/generate-impact-report.dto';
import { TrackSustainabilityMetricDto } from './dto/track-sustainability-metric.dto';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Event Impact')
@ApiBearerAuth()
@Controller('events/:eventId/impact')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ImpactController {
  constructor(private readonly impactService: ImpactService) {}

  @Post('measure')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Measure event impact metrics' })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({ status: 201, description: 'Impact metrics recorded' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  measureImpact(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: MeasureEventImpactDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.impactService.measureEventImpact(eventId, dto, req.user.id);
  }

  @Post('report')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Generate comprehensive impact report' })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({ status: 201, description: 'Report generated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  generateReport(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: GenerateImpactReportDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.impactService.generateImpactReport(eventId, dto, req.user.id);
  }

  @Post('sustainability')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Track sustainability metrics' })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({ status: 201, description: 'Sustainability metric tracked' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  trackSustainability(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: TrackSustainabilityMetricDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.impactService.trackSustainabilityMetric(eventId, dto, req.user.id);
  }

  @Get('sustainability')
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Get all sustainability metrics for an event' })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Sustainability metrics retrieved' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  getSustainabilityMetrics(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.impactService.getSustainabilityMetrics(eventId, req.user.id);
  }

  @Get()
  @Roles(Role.ORGANIZER)
  @ApiOperation({ summary: 'Get event impact data' })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Impact data retrieved' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  getImpact(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.impactService.getEventImpact(eventId, req.user.id);
  }
}
