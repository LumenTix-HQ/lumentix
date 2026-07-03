import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ChatService } from './chat.service';
import { BroadcastMessageDto, ConnectChatDto } from './dto/chat.dto';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('connect')
  connect(@Query() dto: ConnectChatDto) {
    return this.chatService.connect_chat_socket(dto.eventId, dto.userId);
  }

  @Post('message')
  broadcast(@Body() dto: BroadcastMessageDto) {
    return this.chatService.broadcast_chat_message(dto.eventId, dto.userId, dto.username, dto.message);
  }

  @Post('moderate')
  moderate(@Body('message') message: string) {
    return this.chatService.moderate_chat_content(message);
  }
}
