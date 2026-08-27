import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

import { IotCapacityService } from './iot-capacity.service';
import { RegisterSensorDto } from './dto/register-sensor.dto';
import { SensorReadingDto } from './dto/sensor-reading.dto';
import { UpdateCapacityLimitsDto } from './dto/update-capacity-limits.dto';
import {
  CapacityMonitorDto,
  CapacityUpdateResultDto,
  SpaceOptimisationDto,
} from './dto/capacity-response.dto';

@ApiTags('IoT Venue Capacity')
@Controller('events/:eventId/capacity')
export class IotCapacityController {
  constructor(private readonly iotService: IotCapacityService) {}

  // ── Sensor registration ───────────────────────────────────────────────────

  @Post('sensors')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Register an IoT sensor',
    description:
      'Organizer-only. Registers a new IoT sensor for the event. ' +
      'Returns the sensor record plus a one-time API key the device uses to push readings.',
  })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({ status: 201, description: 'Sensor registered. API key shown once — store it securely.' })
  @ApiResponse({ status: 403, description: 'Forbidden — not the event organizer' })
  registerSensor(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: RegisterSensorDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.iotService.registerSensor(eventId, dto, req.user.id);
  }

  @Get('sensors')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List sensors for an event' })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Sensor list' })
  getSensors(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.iotService.getSensors(eventId);
  }

  @Delete('sensors/:sensorId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deactivate a sensor' })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiParam({ name: 'sensorId', description: 'Sensor UUID' })
  @ApiResponse({ status: 200, description: 'Sensor deactivated' })
  deactivateSensor(
    @Param('sensorId', ParseUUIDPipe) sensorId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.iotService.deactivateSensor(sensorId, req.user.id);
  }

  // ── Sensor reading ingestion (device-to-server) ───────────────────────────

  @Post('sensors/:sensorId/reading')
  @ApiOperation({
    summary: 'Push a sensor reading',
    description:
      'Called by the IoT device itself (not a user). ' +
      'Authenticate with the sensor API key in the X-Sensor-Key header.',
  })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiParam({ name: 'sensorId', description: 'Sensor UUID' })
  @ApiHeader({ name: 'X-Sensor-Key', description: 'Sensor API key', required: true })
  @ApiResponse({ status: 201, description: 'Reading accepted' })
  @ApiResponse({ status: 401, description: 'Invalid sensor API key' })
  ingestReading(
    @Param('sensorId', ParseUUIDPipe) sensorId: string,
    @Headers('x-sensor-key') apiKey: string,
    @Body() dto: SensorReadingDto,
  ) {
    return this.iotService.ingestReading(sensorId, apiKey, dto);
  }

  // ── monitor_venue_capacity ────────────────────────────────────────────────

  @Get('monitor')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Monitor venue capacity (real-time)',
    description:
      'Aggregates all active IoT sensor readings into a real-time occupancy snapshot. ' +
      'Compares actual attendance vs ticket sales, computes alert level, ' +
      'and persists a time-series snapshot for trend analysis.',
  })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Real-time capacity snapshot', type: CapacityMonitorDto })
  @ApiResponse({ status: 404, description: 'Event not found' })
  monitorVenueCapacity(
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<CapacityMonitorDto> {
    return this.iotService.monitorVenueCapacity(eventId);
  }

  // ── optimize_space_usage ──────────────────────────────────────────────────

  @Get('optimize')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Optimise space usage',
    description:
      'Analyses occupancy distribution across venue sections and generates ' +
      'actionable crowd-flow recommendations, rebalancing actions, and an ' +
      'estimated time-to-critical based on occupancy trend.',
  })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Space optimisation report', type: SpaceOptimisationDto })
  optimizeSpaceUsage(
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<SpaceOptimisationDto> {
    return this.iotService.optimizeSpaceUsage(eventId);
  }

  // ── update_capacity_limits ────────────────────────────────────────────────

  @Put('limits')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update capacity limits dynamically',
    description:
      'Organizer-only. Adjusts the hard capacity limit in real time based on ' +
      'IoT data or safety-officer instruction. Validates the new limit against ' +
      'current occupancy, optionally pauses ticket sales, and writes an audit log.',
  })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Capacity limit updated', type: CapacityUpdateResultDto })
  @ApiResponse({ status: 400, description: 'New limit below current occupancy' })
  @ApiResponse({ status: 403, description: 'Forbidden — not the event organizer' })
  updateCapacityLimits(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: UpdateCapacityLimitsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<CapacityUpdateResultDto> {
    return this.iotService.updateCapacityLimits(eventId, dto, req.user.id);
  }

  // ── History & snapshots ───────────────────────────────────────────────────

  @Get('history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get capacity history',
    description: 'Returns the last N capacity snapshots for trend charts and analytics.',
  })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max snapshots to return (default 60, max 500)' })
  @ApiResponse({ status: 200, description: 'Capacity snapshot history' })
  getCapacityHistory(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query('limit') limit?: string,
  ) {
    return this.iotService.getCapacityHistory(eventId, limit ? parseInt(limit, 10) : 60);
  }

  @Get('snapshot/latest')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the latest capacity snapshot' })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Latest snapshot' })
  getLatestSnapshot(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.iotService.getLatestSnapshot(eventId);
  }
}
