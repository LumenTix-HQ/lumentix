import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ChatService } from './chat.service';
import { BroadcastMessageDto, ConnectChatDto } from './dto/chat.dto';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('connect')
  @ApiOperation({ summary: 'Connect to an event chat session' })
  @ApiResponse({ status: 200, description: 'Chat connection details returned' })
  @ApiResponse({ status: 400, description: 'Invalid connection request' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  connect(@Query() dto: ConnectChatDto) {
    return this.chatService.connect_chat_socket(dto.eventId, dto.userId);
  }

  @Post('message')
  @ApiOperation({ summary: 'Broadcast a message to an event chat' })
  @ApiResponse({ status: 201, description: 'Message broadcast' })
  @ApiResponse({ status: 400, description: 'Invalid message' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  broadcast(@Body() dto: BroadcastMessageDto) {
    return this.chatService.broadcast_chat_message(dto.eventId, dto.userId, dto.username, dto.message);
  }

  @Post('moderate')
  @ApiOperation({ summary: 'Moderate event chat content' })
  @ApiResponse({ status: 201, description: 'Moderation result returned' })
  @ApiResponse({ status: 400, description: 'Invalid moderation request' })
  @ApiResponse({ status: 422, description: 'Content could not be moderated' })
  moderate(@Body('message') message: string) {
    return this.chatService.moderate_chat_content(message);
  }
}
