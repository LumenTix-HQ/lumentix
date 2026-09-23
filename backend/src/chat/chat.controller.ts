import { Body, Controller, Get, Post, Query, UseGuards, Req } from '@nestjs/common';
import { ChatService } from './chat.service';
import { BroadcastMessageDto, ConnectChatDto, BanUserDto, SetSlowModeDto, ModerateContentDto } from './dto/chat.dto';
import { ApiOperation, ApiResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Chat')
@Controller('chat')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('connect')
  @ApiOperation({ summary: 'Connect to an event chat session' })
  @ApiResponse({ status: 200, description: 'Chat connection details returned' })
  @ApiResponse({ status: 400, description: 'Invalid connection request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  connect(@Query() dto: ConnectChatDto, @Req() req: AuthenticatedRequest) {
    return this.chatService.connect_chat_socket(dto.eventId, req.user.id);
  }

  @Post('message')
  @ApiOperation({ summary: 'Broadcast a message to an event chat' })
  @ApiResponse({ status: 201, description: 'Message broadcast' })
  @ApiResponse({ status: 400, description: 'Invalid message' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  broadcast(@Body() dto: BroadcastMessageDto, @Req() req: AuthenticatedRequest) {
    return this.chatService.broadcast_chat_message(
      dto.eventId,
      req.user.id,
      req.user.email || 'Anonymous',
      dto.message,
    );
  }

  @Post('moderate')
  @ApiOperation({ summary: 'Moderate event chat content' })
  @ApiResponse({ status: 201, description: 'Moderation result returned' })
  @ApiResponse({ status: 400, description: 'Invalid moderation request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 422, description: 'Content could not be moderated' })
  moderate(@Body() body: ModerateContentDto) {
    if (body.eventId && body.userId) {
      return this.chatService.moderate_chat_message(body.eventId, body.userId, body.message);
    }
    return this.chatService.moderate_chat_content(body.message);
  }

  @Post('slow-mode')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.ORGANIZER)
  @ApiOperation({ summary: 'Set slow mode delay for event chat' })
  @ApiResponse({ status: 201, description: 'Slow mode configured' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  setSlowMode(@Body() body: SetSlowModeDto) {
    return this.chatService.set_slow_mode(body.eventId, body.delaySeconds);
  }

  @Post('ban')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.ORGANIZER)
  @ApiOperation({ summary: 'Ban a user from event chat' })
  @ApiResponse({ status: 201, description: 'User banned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  banUser(@Body() body: BanUserDto) {
    return this.chatService.ban_chat_user(body.eventId, body.userId, body.durationMinutes, body.reason);
  }
}
