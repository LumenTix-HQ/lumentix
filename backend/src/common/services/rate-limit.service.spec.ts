import { RateLimitService } from './rate-limit.service';

describe('RateLimitService', () => {
  const redis = {
    zremrangebyscore: jest.fn(),
    zcard: jest.fn(),
    zadd: jest.fn(),
    expire: jest.fn(),
    set: jest.fn(),
    exists: jest.fn(),
    eval: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string, fallback: number) => ({
      RATE_LIMIT_WINDOW_SECONDS: 60,
      RATE_LIMIT_PER_IP: 2,
      RATE_LIMIT_PER_API_KEY: 5,
      RATE_LIMIT_BLOCK_SECONDS: 300,
      RATE_LIMIT_FALLBACK_RATIO: 0.5,
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
    delete (redis as any).eval; // test non-eval path
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

  it('enforces a separate per-API-key window without blocking the IP when only the API key is exhausted', async () => {
    delete (redis as any).eval;
    redis.exists.mockResolvedValue(0);
    redis.zcard.mockResolvedValueOnce(0).mockResolvedValueOnce(5);
    const service = new RateLimitService(redis as any, config as any);

    await expect(service.enforce('203.0.113.10', 'key-1')).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.zcard).toHaveBeenCalledTimes(2);
  });

  it('returns early for an IP that is already blocked', async () => {
    delete (redis as any).eval;
    redis.exists.mockResolvedValue(1);
    const service = new RateLimitService(redis as any, config as any);

    await expect(service.enforce('203.0.113.10')).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 300,
    });
    expect(redis.zcard).not.toHaveBeenCalled();
  });

  it('increments both IP and API-key counters when a request is allowed', async () => {
    delete (redis as any).eval;
    redis.exists.mockResolvedValue(0);
    redis.zcard.mockResolvedValue(0);
    const service = new RateLimitService(redis as any, config as any);

    await expect(service.enforce('203.0.113.10', 'key-1')).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
    const zaddKeys = redis.zadd.mock.calls.map((call: unknown[]) => call[0]);
    expect(zaddKeys).toContain('rate-limit:ip:203.0.113.10');
    expect(zaddKeys).toContain('rate-limit:api-key:key-1');
  });

  describe('Atomic check-and-increment with Redis eval (Lua script)', () => {
    it('uses redis.eval for atomic check and increment when available', async () => {
      redis.eval = jest.fn().mockResolvedValue([1, 1]);
      redis.exists.mockResolvedValue(0);
      const service = new RateLimitService(redis as any, config as any);

      const result = await service.enforce('192.168.1.1');
      expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 });
      expect(redis.eval).toHaveBeenCalledWith(
        RateLimitService.ATOMIC_SLIDING_WINDOW_LUA,
        1,
        'rate-limit:ip:192.168.1.1',
        expect.any(Number),
        expect.any(Number),
        2,
        61,
        expect.any(String),
      );
    });

    it('blocks IP and returns block retry-after when atomic eval rejects request', async () => {
      redis.eval = jest.fn().mockResolvedValue([0, 2]);
      redis.exists.mockResolvedValue(0);
      const service = new RateLimitService(redis as any, config as any);

      const result = await service.enforce('192.168.1.2');
      expect(result).toEqual({ allowed: false, retryAfterSeconds: 300 });
      expect(redis.set).toHaveBeenCalledWith(
        'rate-limit:blocked:192.168.1.2',
        '1',
        'EX',
        300,
      );
    });
  });

  describe('Redis unavailable / error handling & fallback mode', () => {
    it('fails closed for sensitive routes when Redis is down and records observable alert', async () => {
      redis.exists.mockRejectedValue(new Error('Connection lost to Redis cluster'));
      const service = new RateLimitService(redis as any, config as any);

      const result = await service.enforce('10.0.0.1', undefined, { route: '/api/v1/auth/login' });
      expect(result).toEqual({ allowed: false, retryAfterSeconds: 60 });

      const metrics = service.getFallbackMetrics();
      expect(metrics.totalFallbackEvents).toBe(1);
      expect(metrics.lastFallbackAt).toBeInstanceOf(Date);
      expect(metrics.recentAlerts[0].allowed).toBe(false);
      expect(metrics.recentAlerts[0].route).toBe('/api/v1/auth/login');
      expect(metrics.recentAlerts[0].reason).toContain('Redis error on sensitive route');
    });

    it('applies conservative in-memory fallback limiter for non-sensitive routes when Redis is down', async () => {
      redis.exists.mockRejectedValue(new Error('Redis timeout'));
      const service = new RateLimitService(redis as any, config as any);

      // RATE_LIMIT_PER_IP = 2, fallbackRatio = 0.5 -> fallbackLimit = 1
      const firstReq = await service.enforce('10.0.0.2', undefined, { route: '/api/v1/events' });
      expect(firstReq.allowed).toBe(true);

      // Second request in same window exceeds conservative limit of 1
      const secondReq = await service.enforce('10.0.0.2', undefined, { route: '/api/v1/events' });
      expect(secondReq.allowed).toBe(false);
      expect(secondReq.retryAfterSeconds).toBe(60);

      const metrics = service.getFallbackMetrics();
      expect(metrics.totalFallbackEvents).toBe(2);
      expect(metrics.recentAlerts[1].allowed).toBe(false);
      expect(metrics.recentAlerts[1].reason).toContain('in-memory fallback applied');
    });

    it('identifies sensitive routes accurately', () => {
      const service = new RateLimitService(redis as any, config as any);
      expect(service.isSensitiveRoute('/api/auth/login')).toBe(true);
      expect(service.isSensitiveRoute('/api/payments/checkout')).toBe(true);
      expect(service.isSensitiveRoute('/api/tickets/qr/validate')).toBe(true);
      expect(service.isSensitiveRoute('/api/wallet/link')).toBe(true);
      expect(service.isSensitiveRoute('/api/events/list')).toBe(false);
      expect(service.isSensitiveRoute('/api/public/categories')).toBe(false);
    });
  });
});
