import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, Role } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { ListRegistrationsDto } from './dto/list-registrations.dto';
import { RegistrationsService } from './registrations.service';
import { IdempotencyInterceptor } from '../common/interceptors/idempotency.interceptor';

@ApiTags('Registrations')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class RegistrationsController {
  constructor(private readonly service: RegistrationsService) {}

  @Post('events/:id/register')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    summary: 'Register for an event',
    description:
      'Authenticated. Creates a registration for the current user or places the user on the waitlist when the event is full. ' +
      'Supply an Idempotency-Key header to safely retry without creating duplicates.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Optional idempotency key to prevent duplicate registrations on retry',
    required: false,
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiResponse({ status: 201, description: 'Registration created' })
  @ApiResponse({ status: 202, description: 'Added to waitlist' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @ApiResponse({ status: 409, description: 'Already registered' })
  async register(
    @Param('id', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const result = await this.service.register(eventId, req.user.id);
    const body =
      result.waitlistPosition !== undefined
        ? {
            status: 'waitlisted',
            position: result.waitlistPosition,
            registration: result.registration,
          }
        : result.registration;
    return res.status(result.httpStatus).json(body);
  }

  @Get('events/:id/registrations')
  @Roles(Role.ORGANIZER)
  @ApiOperation({
    summary: 'List registrations for an event',
    description:
      'Authenticated organizer-only endpoint. Returns a paginated list of registrations for the specified event.',
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Registrations retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  listForEvent(
    @Param('id', ParseUUIDPipe) eventId: string,
    @Query() dto: ListRegistrationsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.listForEvent(eventId, req.user.id, dto);
  }

  @Get('events/:id/registrations/export')
  @Roles(Role.ORGANIZER)
  @ApiOperation({
    summary: 'Export all registrations for an event as CSV',
    description: 'Organizer-only. Returns all attendees as a CSV file.',
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'CSV file' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded (10/hour per organizer)' })
  async exportCsv(
    @Param('id', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const rateKey = `export-limit:${req.user.id}`;
    const count = await this.redis.incr(rateKey);
    if (count === 1) await this.redis.expire(rateKey, 3600);
    if (count > 10) {
      return res.status(429).json({ message: 'Export rate limit exceeded. Maximum 10 exports per hour.' });
    }

    const csv = await this.service.exportRegistrationsCsv(eventId, req.user.id);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="attendees-${eventId}.csv"`);
    return res.send(csv);
  }

  @Get('users/me/registrations')
  @ApiOperation({
    summary: "Get current user's registrations",
    description:
      'Authenticated. Returns the current user's registrations and waitlist entries with pagination support.',
  })
  @ApiResponse({ status: 200, description: 'User registrations retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  listForUser(
    @Query() dto: ListRegistrationsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.listForUser(req.user.id, dto);
  }

  @Delete('registrations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cancel a registration',
    description:
      'Authenticated. Cancels the current user's registration when the registration is still cancellable.',
  })
  @ApiParam({ name: 'id', description: 'Registration UUID' })
  @ApiResponse({ status: 204, description: 'Registration cancelled' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Registration not found' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.cancel(id, req.user.id);
  }

  @Delete('events/:eventId/registrations/:registrationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Admin cancel registration for an event',
    description:
      'Authenticated. Cancels a confirmed registration for a specific event and triggers refund handling when the registration is eligible.',
  })
  @ApiParam({ name: 'eventId', description: 'Event UUID' })
  @ApiParam({ name: 'registrationId', description: 'Registration UUID' })
  @ApiResponse({ status: 204, description: 'Registration cancelled for the event' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Registration or event not found' })
  adminCancel(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.cancelWithRefund(eventId, registrationId, req.user.id);
  }
}