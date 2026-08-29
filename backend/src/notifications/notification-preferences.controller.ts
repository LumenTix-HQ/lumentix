import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NotificationPreferencesService } from './notification-preferences.service';
import { SaveNotificationPreferencesDto } from './dto/save-notification-preferences.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Notifications')
@Controller('notifications/preferences')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationPreferencesController {
  constructor(private readonly preferencesService: NotificationPreferencesService) {}

  @Get()
  @ApiOperation({
    summary: 'Get notification preferences',
    description: 'Returns the caller\'s per-channel, per-category preferences and quiet hours.',
  })
  @ApiResponse({ status: 200, description: 'Notification preferences' })
  get(@Req() req: AuthenticatedRequest) {
    return this.preferencesService.getNotificationPreferences(req.user.id);
  }

  @Put()
  @ApiOperation({
    summary: 'Save notification preferences',
    description: 'Updates the caller\'s per-channel, per-category preferences and/or quiet hours.',
  })
  @ApiResponse({ status: 200, description: 'Updated preferences' })
  save(
    @Body() dto: SaveNotificationPreferencesDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.preferencesService.saveNotificationPreferences(req.user.id, dto);
  }
}
