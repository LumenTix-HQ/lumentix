import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, concatMap } from 'rxjs/operators';
import { createHash } from 'crypto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.provider';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';

const IDEMPOTENCY_TTL_SECONDS = 86_400; // 24 hours
const IN_PROGRESS_TTL_SECONDS = 60;
const IN_PROGRESS = 'IN_PROGRESS';

type IdempotencyRecord =
  | { state: typeof IN_PROGRESS; bodyHash: string }
  | { state: 'DONE' | 'ERROR'; bodyHash: string; status: number; body: unknown };

/**
 * Idempotency guard for mutating endpoints.
 *
 * A request carrying an `Idempotency-Key` header reserves the key atomically
 * (`SET ... NX EX 60`) *before* the handler runs, so two concurrent requests
 * with the same key can no longer both execute the handler (double charge /
 * double registration). The first request stores its final response and later
 * retries replay it; concurrent duplicates get a 409 while the reservation is
 * still in progress.
 *
 * Keys are scoped by user, HTTP method and route, and the body is hashed so a
 * key reused with a different payload is rejected with a 422 instead of
 * replaying an unrelated response.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    // Without an explicit key (or an authenticated caller) there is nothing to
    // make idempotent — behave exactly as if the interceptor were not present.
    if (!idempotencyKey || !req.user) {
      return next.handle();
    }

    const method = req.method.toUpperCase();
    const route = this.resolveRoute(req);
    const bodyHash = this.hashBody(req);
    const cacheKey = `idempotency:${req.user.id}:${method}:${route}:${idempotencyKey}`;

    // Atomically reserve the key. `SET NX` guarantees only one concurrent
    // request can win the reservation; the value records the payload so a
    // mismatched retry can be detected.
    const reservation: IdempotencyRecord = { state: IN_PROGRESS, bodyHash };
    let acquired = false;
    try {
      const result = await this.redis.set(
        cacheKey,
        JSON.stringify(reservation),
        'EX',
        IN_PROGRESS_TTL_SECONDS,
        'NX',
      );
      acquired = result === 'OK';
    } catch (err) {
      // If Redis is unavailable we must not block the request; degrade to
      // non-idempotent behaviour rather than failing the payment/registration.
      this.logger.error(
        `Idempotency reservation failed, proceeding without it: ${this.describe(err)}`,
      );
      return next.handle();
    }

    if (!acquired) {
      return this.handleExisting(cacheKey, bodyHash, res, next);
    }

    return next.handle().pipe(
      // Wait for persistence before emitting the response so the key is always
      // stored before the client can observe success (fixes the previous
      // fire-and-forget `tap(async ...)`).
      concatMap(async (body) => {
        await this.storeResponse(cacheKey, {
          state: 'DONE',
          bodyHash,
          status: res.statusCode,
          body,
        });
        return body;
      }),
      catchError((err: unknown) =>
        from(this.storeError(cacheKey, bodyHash, err)).pipe(
          concatMap(() => throwError(() => err)),
        ),
      ),
    );
  }

  /**
   * A key that already exists is either still in progress (409) or belongs to
   * an earlier completed request. Completed requests are replayed only when the
   * payload matches; a different payload is a client bug and gets a 422.
   */
  private async handleExisting(
    cacheKey: string,
    bodyHash: string,
    res: Response,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    let raw: string | null = null;
    try {
      raw = await this.redis.get(cacheKey);
    } catch (err) {
      // A failed lookup must not wedge the endpoint; fall through to normal
      // (non-idempotent) handling rather than erroring the request.
      this.logger.error(
        `Idempotency lookup failed, proceeding without it: ${this.describe(err)}`,
      );
      return next.handle();
    }

    if (!raw) {
      // Reservation vanished between SET and GET (e.g. process restart) —
      // treat it as in progress and let the caller retry.
      throw new ConflictException(
        'A request with this Idempotency-Key is already in progress',
      );
    }

    let record: IdempotencyRecord;
    try {
      record = JSON.parse(raw) as IdempotencyRecord;
    } catch {
      throw new ConflictException(
        'A request with this Idempotency-Key is already in progress',
      );
    }

    if (record.state === IN_PROGRESS) {
      throw new ConflictException(
        'A request with this Idempotency-Key is already in progress',
      );
    }

    if (record.bodyHash !== bodyHash) {
      throw new UnprocessableEntityException(
        'Idempotency-Key was already used with a different request payload',
      );
    }

    return of(
      res
        .status(record.status)
        .setHeader('X-Idempotent-Replay', 'true')
        .json(record.body),
    );
  }

  private async storeResponse(
    cacheKey: string,
    record: IdempotencyRecord,
  ): Promise<void> {
    try {
      await this.redis.set(
        cacheKey,
        JSON.stringify(record),
        'EX',
        IDEMPOTENCY_TTL_SECONDS,
      );
    } catch (err) {
      this.logger.error(
        `Failed to persist idempotent response: ${this.describe(err)}`,
      );
    }
  }

  /**
   * Persist the terminal error so a retry after a 4xx/5xx replays instead of
   * re-executing the handler. Non-HTTP failures are transient, so the
   * reservation is released to allow a fresh attempt.
   */
  private async storeError(
    cacheKey: string,
    bodyHash: string,
    err: unknown,
  ): Promise<void> {
    try {
      if (err instanceof HttpException) {
        await this.redis.set(
          cacheKey,
          JSON.stringify({
            state: 'ERROR',
            bodyHash,
            status: err.getStatus(),
            body: err.getResponse(),
          }),
          'EX',
          IDEMPOTENCY_TTL_SECONDS,
        );
        return;
      }
      await this.redis.del(cacheKey);
    } catch (redisErr) {
      this.logger.error(
        `Failed to persist idempotent error: ${this.describe(redisErr)}`,
      );
    }
  }

  private resolveRoute(req: AuthenticatedRequest): string {
    const routePath = (req as AuthenticatedRequest & { route?: { path?: string } })
      .route?.path;
    return routePath ?? req.originalUrl ?? req.url ?? '';
  }

  private hashBody(req: AuthenticatedRequest): string {
    const rawBody = (req as AuthenticatedRequest & { rawBody?: Buffer }).rawBody;
    const serialized = rawBody
      ? rawBody.toString('utf8')
      : JSON.stringify(req.body ?? {});
    return createHash('sha256').update(serialized).digest('hex');
  }

  private describe(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
