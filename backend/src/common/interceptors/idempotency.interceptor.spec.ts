import { Test, TestingModule } from '@nestjs/testing';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { REDIS_CLIENT } from '../redis/redis.module';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;
  let redisClient: { get: jest.Mock; set: jest.Mock };

  beforeEach(async () => {
    redisClient = {
      get: jest.fn(),
      set: jest.fn(),
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

  it('should return cached response if key exists', async () => {
    const cachedResponse = { status: 200, body: { message: 'cached' } };
    redisClient.get.mockResolvedValue(JSON.stringify(cachedResponse));

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { 'idempotency-key': 'test-key' },
          user: { id: 'user-1' },
        }),
        getResponse: () => ({
          status: jest.fn().mockReturnThis(),
          setHeader: jest.fn().mockReturnThis(),
          json: jest.fn((body) => body),
        }),
      }),
    } as unknown as ExecutionContext;

    const next = { handle: () => of({ message: 'live' }) } as CallHandler;

    const result = await interceptor.intercept(context, next);
    expect(redisClient.get).toHaveBeenCalledWith('idempotency:user-1:test-key');
    expect(result).toEqual({ message: 'cached' });
  });

  it('should cache response if key does not exist', async () => {
    redisClient.get.mockResolvedValue(null);

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { 'idempotency-key': 'test-key' },
          user: { id: 'user-1' },
        }),
        getResponse: () => ({
          statusCode: 201,
        }),
      }),
    } as unknown as ExecutionContext;

    const next = { handle: () => of({ message: 'live' }) } as CallHandler;

    await interceptor.intercept(context, next).toPromise();
    expect(redisClient.get).toHaveBeenCalledWith('idempotency:user-1:test-key');
    expect(redisClient.set).toHaveBeenCalledWith(
      'idempotency:user-1:test-key',
      JSON.stringify({ status: 201, body: { message: 'live' } }),
      'EX',
      86400,
    );
  });

  it('should bypass interceptor if no idempotency key', async () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {},
        }),
      }),
    } as unknown as ExecutionContext;

    const next = { handle: () => of({ message: 'live' }) } as CallHandler;

    const result = await interceptor.intercept(context, next).toPromise();
    expect(redisClient.get).not.toHaveBeenCalled();
    expect(redisClient.set).not.toHaveBeenCalled();
    expect(result).toEqual({ message: 'live' });
  });
});