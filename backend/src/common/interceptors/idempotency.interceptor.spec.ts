import { Test, TestingModule } from '@nestjs/testing';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { REDIS_CLIENT } from '../redis/redis.provider';
import { ExecutionContext, CallHandler, ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { createHash } from 'crypto';

const hashBody = (body: unknown): string =>
  createHash('sha256').update(JSON.stringify(body ?? {})).digest('hex');

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;
  let redisClient: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  const buildContext = (
    overrides: {
      headers?: Record<string, string>;
      user?: { id: string } | undefined;
      method?: string;
      route?: string;
      url?: string;
      body?: unknown;
      statusCode?: number;
    } = {},
  ) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: overrides.headers ?? { 'idempotency-key': 'test-key' },
          user:
            'user' in overrides ? overrides.user : { id: 'user-1' },
          method: overrides.method ?? 'POST',
          route: { path: overrides.route ?? '/payments' },
          originalUrl: overrides.url ?? '/payments',
          url: overrides.url ?? '/payments',
          body: overrides.body ?? {},
        }),
        getResponse: () => ({
          statusCode: overrides.statusCode ?? 201,
          status: jest.fn().mockReturnThis(),
          setHeader: jest.fn().mockReturnThis(),
          json: jest.fn((body) => body),
        }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    redisClient = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyInterceptor,
        {
          provide: REDIS_CLIENT,
          useValue: redisClient,
        },
      ],
    }).compile();

    interceptor = module.get<IdempotencyInterceptor>(IdempotencyInterceptor);
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should replay a completed response for a matching payload', async () => {
    const body = { amount: 10 };
    const cachedResponse = {
      state: 'DONE',
      bodyHash: hashBody(body),
      status: 200,
      body: { message: 'cached' },
    };
    redisClient.get.mockResolvedValue(JSON.stringify(cachedResponse));

    const context = buildContext({ body });
    const next = { handle: () => of({ message: 'live' }) } as CallHandler;

    const result = await interceptor.intercept(context, next);
    expect(redisClient.get).toHaveBeenCalledWith(
      'idempotency:user-1:POST:/payments:test-key',
    );
    expect(await firstValueFrom(result)).toEqual({ message: 'cached' });
  });

  it('should not execute the handler concurrently while a request is in progress', async () => {
    redisClient.set.mockResolvedValue(null);
    redisClient.get.mockResolvedValue(
      JSON.stringify({ state: 'IN_PROGRESS', bodyHash: hashBody({}) }),
    );

    const context = buildContext();
    const next = { handle: () => of({ message: 'live' }) } as CallHandler;

    await expect(interceptor.intercept(context, next)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('should reject a key reused with a different payload', async () => {
    redisClient.set.mockResolvedValue(null);
    redisClient.get.mockResolvedValue(
      JSON.stringify({
        state: 'DONE',
        bodyHash: hashBody({ amount: 1 }),
        status: 201,
        body: { ok: true },
      }),
    );

    const context = buildContext({ body: { amount: 2 } });
    const next = { handle: () => of({ message: 'live' }) } as CallHandler;

    await expect(interceptor.intercept(context, next)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('should reserve atomically and cache the response after the handler', async () => {
    redisClient.set.mockResolvedValue('OK');

    const context = buildContext();
    const next = { handle: () => of({ message: 'live' }) } as CallHandler;

    const result = await interceptor.intercept(context, next);
    expect(redisClient.set).toHaveBeenNthCalledWith(
      1,
      'idempotency:user-1:POST:/payments:test-key',
      JSON.stringify({ state: 'IN_PROGRESS', bodyHash: hashBody({}) }),
      'EX',
      60,
      'NX',
    );
    expect(await firstValueFrom(result)).toEqual({ message: 'live' });
    expect(redisClient.set).toHaveBeenNthCalledWith(
      2,
      'idempotency:user-1:POST:/payments:test-key',
      JSON.stringify({
        state: 'DONE',
        bodyHash: hashBody({}),
        status: 201,
        body: { message: 'live' },
      }),
      'EX',
      86400,
    );
  });

  it('should scope keys by method and route so the same key on another route runs', async () => {
    redisClient.set.mockResolvedValue('OK');

    const context = buildContext({ method: 'PATCH', route: '/registrations' });
    const next = { handle: () => of({ message: 'live' }) } as CallHandler;

    const result = await interceptor.intercept(context, next);
    expect(redisClient.set).toHaveBeenCalledWith(
      'idempotency:user-1:PATCH:/registrations:test-key',
      expect.any(String),
      'EX',
      60,
      'NX',
    );
    expect(await firstValueFrom(result)).toEqual({ message: 'live' });
  });

  it('should bypass the interceptor when no idempotency key is supplied', async () => {
    const context = buildContext({ headers: {} });
    const next = { handle: () => of({ message: 'live' }) } as CallHandler;

    const result = await interceptor.intercept(context, next);
    expect(redisClient.get).not.toHaveBeenCalled();
    expect(redisClient.set).not.toHaveBeenCalled();
    expect(await firstValueFrom(result)).toEqual({ message: 'live' });
  });

  it('should proceed without idempotency when Redis is unavailable', async () => {
    redisClient.set.mockRejectedValue(new Error('redis down'));

    const context = buildContext();
    const next = { handle: () => of({ message: 'live' }) } as CallHandler;

    const result = await interceptor.intercept(context, next);
    expect(await firstValueFrom(result)).toEqual({ message: 'live' });
    expect(redisClient.get).not.toHaveBeenCalled();
  });

  it('should proceed when the existing-key lookup fails', async () => {
    redisClient.set.mockResolvedValue(null);
    redisClient.get.mockRejectedValue(new Error('redis down'));

    const context = buildContext();
    const next = { handle: () => of({ message: 'live' }) } as CallHandler;

    const result = await interceptor.intercept(context, next);
    expect(await firstValueFrom(result)).toEqual({ message: 'live' });
  });

  it('should still return the response when storing it fails', async () => {
    redisClient.set.mockResolvedValueOnce('OK');
    redisClient.set.mockRejectedValueOnce(new Error('redis down'));

    const context = buildContext();
    const next = { handle: () => of({ message: 'live' }) } as CallHandler;

    const result = await interceptor.intercept(context, next);
    expect(await firstValueFrom(result)).toEqual({ message: 'live' });
  });
});
