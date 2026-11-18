import { ConfigService } from '@nestjs/config';
import {
  buildRedisOptions,
  buildRedisUrl,
  redisOptionsFromUrl,
} from './redis-options';

function configWith(values: Record<string, unknown>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

describe('redis connection options (#1608)', () => {
  it('uses REDIS_PASSWORD and REDIS_TLS with the discrete settings', () => {
    const options = buildRedisOptions(
      configWith({
        REDIS_HOST: 'redis.internal',
        REDIS_PORT: 6380,
        REDIS_USERNAME: 'lumentix',
        REDIS_PASSWORD: 's3cret',
        REDIS_DB: 2,
        REDIS_TLS: true,
      }),
    );

    expect(options).toMatchObject({
      host: 'redis.internal',
      port: 6380,
      username: 'lumentix',
      password: 's3cret',
      db: 2,
      tls: {},
    });
  });

  it('parses a rediss:// URL with credentials and a database', () => {
    const url = 'rediss://default:p%40ss@cache.example.com:6380/3';

    expect(redisOptionsFromUrl(url)).toEqual({
      host: 'cache.example.com',
      port: 6380,
      username: 'default',
      password: 'p@ss',
      db: 3,
      tls: {},
    });
  });

  it('prefers REDIS_URL over the discrete host/port', () => {
    const options = buildRedisOptions(
      configWith({
        REDIS_URL: 'redis://:url-password@10.0.0.5:6379/1',
        REDIS_HOST: 'ignored-host',
        REDIS_PORT: 1111,
        REDIS_PASSWORD: 'ignored-password',
      }),
    );

    expect(options).toMatchObject({
      host: '10.0.0.5',
      port: 6379,
      password: 'url-password',
      db: 1,
    });
    expect(options.tls).toBeUndefined();
  });

  it('lets REDIS_TLS upgrade a plain redis:// URL', () => {
    const options = buildRedisOptions(
      configWith({
        REDIS_URL: 'redis://cache.internal:6379',
        REDIS_TLS: 'true',
      }),
    );

    expect(options.tls).toEqual({});
  });

  it('builds an authenticated rediss URL for the Keyv cache store', () => {
    const url = buildRedisUrl(
      configWith({
        REDIS_HOST: 'redis.internal',
        REDIS_PORT: 6380,
        REDIS_USERNAME: 'lumentix',
        REDIS_PASSWORD: 'p@ss word',
        REDIS_DB: 2,
        REDIS_TLS: true,
      }),
    );

    expect(url).toBe('rediss://lumentix:p%40ss%20word@redis.internal:6380/2');
  });

  it('keeps REDIS_URL credentials when building the Keyv URL', () => {
    const url = buildRedisUrl(
      configWith({
        REDIS_URL: 'redis://:url-password@10.0.0.5:6379/1',
      }),
    );

    expect(url).toBe('redis://:url-password@10.0.0.5:6379/1');
  });

  it('falls back to localhost defaults', () => {
    expect(buildRedisOptions(configWith({}))).toEqual({
      host: 'localhost',
      port: 6379,
    });
  });
});
