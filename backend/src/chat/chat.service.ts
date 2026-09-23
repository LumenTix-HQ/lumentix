import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from './entities/chat-message.entity';
import { RedisService } from '../common/redis/redis.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  // Redis key prefixes
  private readonly BAN_KEY_PREFIX = 'chat:ban:';
  private readonly SLOW_MODE_KEY_PREFIX = 'chat:slow-mode:';
  private readonly MESSAGE_TIMESTAMP_KEY_PREFIX = 'chat:msg-ts:';

  constructor(
    @InjectRepository(ChatMessage)
    private readonly chatRepo: Repository<ChatMessage>,
    private readonly redisService: RedisService,
  ) {}

  connect_chat_socket(eventId: string, userId: string) {
    // Note: In a real implementation with WebSocket support, this would initiate a real socket connection
    // For now, return connection metadata. Clients should connect to ws://<host>/ws/chat/<eventId>
    return {
      eventId,
      userId,
      wsUrl: `/ws/chat/${eventId}`,
      connected: true,
    };
  }

  async broadcast_chat_message(eventId: string, userId: string, username: string, message: string) {
    const modResult = await this.moderate_chat_message(eventId, userId, message);
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
    const flagged = banned.some((w) => message.toLowerCase().includes(w));
    return { message, flagged, reason: flagged ? 'content_policy_violation' : null };
  }

  async set_slow_mode(eventId: string, delaySeconds: number) {
    if (delaySeconds <= 0) {
      // Disable slow mode
      await this.redisService.del(this.SLOW_MODE_KEY_PREFIX + eventId);
      return { eventId, slowModeSeconds: 0, enabled: false };
    }

    // Store slow mode delay in Redis (no expiry, only removed when disabled)
    await this.redisService.set(
      this.SLOW_MODE_KEY_PREFIX + eventId,
      String(delaySeconds),
    );

    return { eventId, slowModeSeconds: delaySeconds, enabled: true };
  }

  async ban_chat_user(
    eventId: string,
    userId: string,
    durationMinutes?: number,
    reason?: string,
  ) {
    const banKey = `${this.BAN_KEY_PREFIX}${eventId}:${userId}`;

    if (durationMinutes && durationMinutes > 0) {
      // Store ban with TTL expiry in Redis
      const ttlSeconds = durationMinutes * 60;
      await this.redisService.setex(banKey, ttlSeconds, '1');
    } else {
      // Permanent ban (TTL removed, expires only when explicitly deleted)
      await this.redisService.set(banKey, '1');
    }

    this.logger.log(
      `User ${userId} banned from event ${eventId} for ${durationMinutes ?? 'indefinite'} minutes. Reason: ${reason || 'unspecified'}`,
    );

    return {
      eventId,
      userId,
      banned: true,
      durationMinutes: durationMinutes ?? null,
      reason: reason ?? 'Violation of chat rules',
    };
  }

  private async isBanned(eventId: string, userId: string): Promise<boolean> {
    const banKey = `${this.BAN_KEY_PREFIX}${eventId}:${userId}`;
    const banned = await this.redisService.exists(banKey);
    return banned === 1;
  }

  async moderate_chat_message(eventId: string, userId: string, message: string) {
    // Check if user is banned
    const banned = await this.isBanned(eventId, userId);
    if (banned) {
      return {
        allowed: false,
        flagged: true,
        reason: 'user_banned',
        message,
        filteredMessage: message,
      };
    }

    // Check slow mode
    const slowModeKeyStr = await this.redisService.get(this.SLOW_MODE_KEY_PREFIX + eventId);
    const slowModeDelay = slowModeKeyStr ? parseInt(slowModeKeyStr, 10) : 0;

    if (slowModeDelay > 0) {
      const userKey = `${this.MESSAGE_TIMESTAMP_KEY_PREFIX}${eventId}:${userId}`;
      const now = Date.now();
      const lastMsgTimeStr = await this.redisService.get(userKey);
      const lastMsgTime = lastMsgTimeStr ? parseInt(lastMsgTimeStr, 10) : 0;

      if (now - lastMsgTime < slowModeDelay * 1000) {
        return {
          allowed: false,
          flagged: false,
          reason: 'slow_mode_active',
          message,
          filteredMessage: message,
        };
      }

      // Update last message timestamp
      await this.redisService.set(userKey, String(now));
    }

    // Apply content filtering
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
