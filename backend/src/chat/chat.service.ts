import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from './entities/chat-message.entity';

@Injectable()
export class ChatService {
  private readonly bannedUsers = new Map<string, Set<string>>();
  private readonly slowModeDelays = new Map<string, number>();
  private readonly lastMessageTimestamps = new Map<string, number>();

  constructor(
    @InjectRepository(ChatMessage)
    private readonly chatRepo: Repository<ChatMessage>,
  ) {}

  connect_chat_socket(eventId: string, userId: string) {
    return { eventId, userId, wsUrl: `/ws/chat/${eventId}`, connected: true };
  }

  async broadcast_chat_message(eventId: string, userId: string, username: string, message: string) {
    const modResult = this.moderate_chat_message(eventId, userId, message);
    if (!modResult.allowed) {
      throw new Error(`Message not allowed: ${modResult.reason}`);
    }
    const msg = this.chatRepo.create({
      eventId,
      userId,
      username,
      message: modResult.filteredMessage,
      flagged: modResult.flagged,
    });
    return this.chatRepo.save(msg);
  }

  moderate_chat_content(message: string) {
    const banned = ['spam', 'hate', 'abuse'];
    const flagged = banned.some(w => message.toLowerCase().includes(w));
    return { message, flagged, reason: flagged ? 'content_policy_violation' : null };
  }

  set_slow_mode(eventId: string, delaySeconds: number) {
    this.slowModeDelays.set(eventId, delaySeconds);
    return { eventId, slowModeSeconds: delaySeconds, enabled: delaySeconds > 0 };
  }

  ban_chat_user(eventId: string, userId: string, durationMinutes?: number, reason?: string) {
    if (!this.bannedUsers.has(eventId)) {
      this.bannedUsers.set(eventId, new Set());
    }
    this.bannedUsers.get(eventId)!.add(userId);
    return {
      eventId,
      userId,
      banned: true,
      durationMinutes: durationMinutes ?? 0,
      reason: reason ?? 'Violation of chat rules',
    };
  }

  moderate_chat_message(eventId: string, userId: string, message: string) {
    if (this.bannedUsers.get(eventId)?.has(userId)) {
      return {
        allowed: false,
        flagged: true,
        reason: 'user_banned',
        message,
        filteredMessage: message,
      };
    }

    const slowModeDelay = this.slowModeDelays.get(eventId) ?? 0;
    if (slowModeDelay > 0) {
      const userKey = `${eventId}:${userId}`;
      const now = Date.now();
      const lastMsgTime = this.lastMessageTimestamps.get(userKey) ?? 0;
      if (now - lastMsgTime < slowModeDelay * 1000) {
        return {
          allowed: false,
          flagged: false,
          reason: 'slow_mode_active',
          message,
          filteredMessage: message,
        };
      }
      this.lastMessageTimestamps.set(userKey, now);
    }

    const filterWords = ['spam', 'hate', 'abuse', 'scam', 'offensive'];
    let filteredMessage = message;
    let flagged = false;

    filterWords.forEach((word) => {
      const regex = new RegExp(word, 'gi');
      if (regex.test(filteredMessage)) {
        flagged = true;
        filteredMessage = filteredMessage.replace(regex, '***');
      }
    });

    return {
      allowed: true,
      flagged,
      reason: flagged ? 'content_policy_violation' : null,
      message,
      filteredMessage,
    };
  }
}
