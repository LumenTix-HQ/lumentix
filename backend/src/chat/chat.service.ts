import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from './entities/chat-message.entity';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatMessage)
    private readonly chatRepo: Repository<ChatMessage>,
  ) {}

  connect_chat_socket(eventId: string, userId: string) {
    return { eventId, userId, wsUrl: `/ws/chat/${eventId}`, connected: true };
  }

  async broadcast_chat_message(eventId: string, userId: string, username: string, message: string) {
    const flagged = this.moderate_chat_content(message).flagged;
    const msg = this.chatRepo.create({ eventId, userId, username, message, flagged });
    return this.chatRepo.save(msg);
  }

  moderate_chat_content(message: string) {
    const banned = ['spam', 'hate', 'abuse'];
    const flagged = banned.some(w => message.toLowerCase().includes(w));
    return { message, flagged, reason: flagged ? 'content_policy_violation' : null };
  }
}
