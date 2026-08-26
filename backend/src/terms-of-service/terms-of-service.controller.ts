import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TermsOfServiceService } from './terms-of-service.service';
import { SaveEventTosDto } from './dto/save-event-tos.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Terms of Service')
@Controller('events/:eventId/terms-of-service')
export class TermsOfServiceController {
  constructor(private readonly tosService: TermsOfServiceService) {}

  @Patch()
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Save or update event ToS',
    description:
      'Organizer-only. Saves or updates the Terms of Service for an event, including liability disclaimers and custom agreements.',
  })
  @ApiResponse({ status: 200, description: 'ToS saved' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  saveEventTos(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: SaveEventTosDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.tosService.saveEventTos(eventId, dto, req.user.id);
  }

  @Get()
  @ApiOperation({
    summary: 'Fetch ToS for checkout',
    description:
      'Public. Returns the active Terms of Service for an event to display during checkout.',
  })
  @ApiResponse({ status: 200, description: 'ToS content' })
  @ApiResponse({ status: 404, description: 'No active ToS found' })
  fetchTosForCheckout(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.tosService.fetchTosForCheckout(eventId);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.ORGANIZER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get ToS version history',
    description: 'Organizer-only. Returns all versions of ToS for an event.',
  })
  @ApiResponse({ status: 200, description: 'ToS history' })
  getHistory(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.tosService.getEventTosHistory(eventId);
  }
}
