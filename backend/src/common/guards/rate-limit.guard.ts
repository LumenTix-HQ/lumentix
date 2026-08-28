import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { RateLimitService } from '../services/rate-limit.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly rateLimitService: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Record<string, any>>();
    const ip = request.ip ?? request.ips?.[0] ?? request.socket?.remoteAddress;
    if (!ip) return true;

    const apiKeyHeader = request.headers?.['x-api-key'];
    const apiKey = typeof apiKeyHeader === 'string' ? apiKeyHeader : undefined;
    const result = await this.rateLimitService.enforce(ip, apiKey);
    if (!result.allowed) {
      throw new ThrottlerException(`Rate limit exceeded. Try again in ${result.retryAfterSeconds} seconds.`);
    }
    return true;
  }
}