import { RateLimitService } from './rate-limit.service';

describe('RateLimitService', () => {
  const redis = {
    zremrangebyscore: jest.fn(),
    zcard: jest.fn(),
    zadd: jest.fn(),
    expire: jest.fn(),
    set: jest.fn(),
    exists: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string, fallback: number) => ({
      RATE_LIMIT_WINDOW_SECONDS: 60,
      RATE_LIMIT_PER_IP: 2,
      RATE_LIMIT_PER_API_KEY: 5,
      RATE_LIMIT_BLOCK_SECONDS: 300,
    }[key] ?? fallback)),
  };

  beforeEach(() => jest.clearAllMocks());

  it('checks the current sliding window and removes expired requests', async () => {
    redis.zcard.mockResolvedValue(1);
    const service = new RateLimitService(redis as any, config as any);

    await expect(service.check_rate_limit('ip', '203.0.113.10', 2)).resolves.toEqual({
      allowed: true,
      count: 1,
      limit: 2,
      retryAfterSeconds: 60,
    });
    expect(redis.zremrangebyscore).toHaveBeenCalledWith(
      'rate-limit:ip:203.0.113.10',
      0,
      expect.any(Number),
    );
  });

  it('increments a sorted-set request counter with a TTL', async () => {
    redis.zcard.mockResolvedValue(3);
    const service = new RateLimitService(redis as any, config as any);

    await expect(service.increment_request_counter('api-key', 'key-1')).resolves.toBe(3);
    expect(redis.zadd).toHaveBeenCalledWith(
      'rate-limit:api-key:key-1',
      expect.any(Number),
      expect.stringContaining(':')
    );
    expect(redis.expire).toHaveBeenCalledWith('rate-limit:api-key:key-1', 61);
  });

  it('blocks an abusive IP when its IP window is exceeded', async () => {
    redis.exists.mockResolvedValue(0);
    redis.zcard.mockResolvedValueOnce(2);
    const service = new RateLimitService(redis as any, config as any);

    await expect(service.enforce('203.0.113.10')).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 300,
    });
    expect(redis.set).toHaveBeenCalledWith(
      'rate-limit:blocked:203.0.113.10',
      '1',
      'EX',
      300,
    );
  });
});