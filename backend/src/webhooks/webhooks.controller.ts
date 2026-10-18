import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { WebhooksService } from './webhooks.service';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Webhooks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
@ApiResponse({ status: 401, description: 'Unauthorized' })
@ApiResponse({ status: 403, description: 'Forbidden' })
@ApiResponse({ status: 404, description: 'Event not found' })
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Get('events/:id/webhooks/deliveries')
  @Roles(UserRole.ORGANIZER)
  @ApiOperation({ summary: 'Get webhook delivery history for an event' })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Webhook deliveries retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  getDeliveries(
    @Param('id', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.webhooksService.getDeliveriesForEvent(eventId, req.user.id);
  }

  @Get('events/:id/webhooks/dead-letters')
  @Roles(UserRole.ORGANIZER)
  @ApiOperation({ summary: 'Get webhook deliveries that exhausted all retry attempts' })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Webhook dead letters retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  getDeadLetters(
    @Param('id', ParseUUIDPipe) eventId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.webhooksService.getDeadLettersForEvent(eventId, req.user.id);
  }

  @Post('events/:id/webhooks/dead-letters/:deadLetterId/retry')
  @Roles(UserRole.ORGANIZER)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Re-queue a dead-lettered webhook delivery with a fresh retry budget' })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiParam({ name: 'deadLetterId', description: 'Dead letter UUID' })
  @ApiResponse({ status: 202, description: 'Delivery re-queued' })
  retryDeadLetter(
    @Param('id', ParseUUIDPipe) eventId: string,
    @Param('deadLetterId', ParseUUIDPipe) deadLetterId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.webhooksService.replayDeadLetter(eventId, deadLetterId, req.user.id);
  }
}
