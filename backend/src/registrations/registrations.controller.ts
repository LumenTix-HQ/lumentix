import {
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
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
import { REDIS_CLIENT } from '../common/redis/redis.module';
import Redis from 'ioredis';

const IDEMPOTENCY_TTL_SECONDS = 86_400; // 24 hours

@ApiTags('Registrations')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class RegistrationsController {
  constructor(
    private readonly service: RegistrationsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Post('events/:id/register')
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
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    // Idempotency cache lookup
    if (idempotencyKey) {
      const cacheKey = `idempotency:${req.user.id}:${idempotencyKey}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const payload = JSON.parse(cached) as { status: number; body: unknown };
        return res
          .status(payload.status)
          .setHeader('X-Idempotent-Replay', 'true')
          .json(payload.body);
      }

      const result = await this.service.register(eventId, req.user.id);
      const body =
        result.waitlistPosition !== undefined
          ? {
              status: 'waitlisted',
              position: result.waitlistPosition,
              registration: result.registration,
            }
          : result.registration;

      // Cache the response for 24 hours
      await this.redis.set(
        cacheKey,
        JSON.stringify({ status: result.httpStatus, body }),
        'EX',
        IDEMPOTENCY_TTL_SECONDS,
      );

      return res.status(result.httpStatus).json(body);
    }

    const result = await this.service.register(eventId, req.user.id);
    return res.status(result.httpStatus).json(
      result.waitlistPosition !== undefined
        ? {
            status: 'waitlisted',
            position: result.waitlistPosition,
            registration: result.registration,
          }
        : result.registration,
    );
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
