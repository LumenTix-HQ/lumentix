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
import { TestingService } from './testing.service';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Event Testing')
@ApiBearerAuth()
@Controller('testing/events')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TestingController {
  constructor(private readonly testingService: TestingService) {}

  @Post(':eventId/lifecycle')
  @Roles(Role.ADMIN, Role.ORGANIZER)
  @ApiOperation({ summary: 'Test event lifecycle' })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Lifecycle test results' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  testLifecycle(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.testingService.testEventLifecycle(eventId);
  }

  @Post(':eventId/load')
  @Roles(Role.ADMIN, Role.ORGANIZER)
  @ApiOperation({ summary: 'Simulate high load on event' })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Load test results' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  simulateLoad(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() options: { concurrentUsers?: number; requestsPerUser?: number; duration?: number },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.testingService.simulateHighLoad(eventId, options);
  }

  @Post(':eventId/edge-cases')
  @Roles(Role.ADMIN, Role.ORGANIZER)
  @ApiOperation({ summary: 'Validate edge cases for event' })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Edge case validation results' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  validateEdgeCases(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.testingService.validateEdgeCases(eventId);
  }

  @Post(':eventId/pipeline')
  @Roles(Role.ADMIN, Role.ORGANIZER)
  @ApiOperation({ summary: 'Run automated test pipeline' })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Automated test pipeline results' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  runPipeline(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.testingService.runAutomatedTestPipeline(eventId);
  }
}
