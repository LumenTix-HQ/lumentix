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
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { PerformanceService } from './performance.service';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Event Performance')
@ApiBearerAuth()
@Controller('performance/events')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PerformanceController {
  constructor(private readonly performanceService: PerformanceService) {}

  @Post(':eventId/optimize')
  @Roles(Role.ADMIN, Role.ORGANIZER)
  @ApiOperation({ summary: 'Optimize contract performance' })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Optimization results' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  optimizeContract(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.performanceService.optimizeContractPerformance(eventId);
  }

  @Post(':eventId/cache')
  @Roles(Role.ADMIN, Role.ORGANIZER)
  @ApiOperation({ summary: 'Implement smart caching' })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Caching configuration' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  implementCaching(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
    @Body() config?: { ttl?: number; maxSize?: number; strategy?: 'lru' | 'lfu' | 'fifo'; refreshInterval?: number },
  ) {
    return this.performanceService.implementSmartCaching(eventId, config);
  }

  @Get(':eventId/monitor')
  @Roles(Role.ADMIN, Role.ORGANIZER)
  @ApiOperation({ summary: 'Monitor system performance' })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Performance metrics' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  monitorPerformance(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.performanceService.monitorSystemPerformance(eventId);
  }

  @Get(':eventId/history')
  @Roles(Role.ADMIN, Role.ORGANIZER)
  @ApiOperation({ summary: 'Get performance history' })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Performance history' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  getPerformanceHistory(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
    @Query('hours') hours?: number,
  ) {
    return this.performanceService.getPerformanceHistory(eventId, hours);
  }

  @Post(':eventId/cache/clear')
  @Roles(Role.ADMIN, Role.ORGANIZER)
  @ApiOperation({ summary: 'Clear cache for event' })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Cache cleared' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  clearCache(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.performanceService.clearCache(eventId);
  }
}
