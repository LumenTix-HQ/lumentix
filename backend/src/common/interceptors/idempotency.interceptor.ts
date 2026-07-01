import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Response } from 'express';
import { of } from 'rxjs';
import { tap } from 'rxjs/operators';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';

const IDEMPOTENCY_TTL_SECONDS = 86_400; // 24 hours

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    const idempotencyKey = req.headers['idempotency-key'] as string;

    if (!idempotencyKey) {
      return next.handle();
    }

    const cacheKey = `idempotency:${req.user.id}:${idempotencyKey}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      const payload = JSON.parse(cached) as { status: number; body: unknown };
      return of(
        res
          .status(payload.status)
          .setHeader('X-Idempotent-Replay', 'true')
          .json(payload.body),
      );
    }

    return next.handle().pipe(
      tap(async (body) => {
        const response = {
          status: res.statusCode,
          body,
        };
        await this.redis.set(
          cacheKey,
          JSON.stringify(response),
          'EX',
          IDEMPOTENCY_TTL_SECONDS,
        );
      }),
    );
  }
}