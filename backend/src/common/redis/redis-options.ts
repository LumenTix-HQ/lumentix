import type { ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'ioredis';

export interface RedisConnectionSettings {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls: boolean;
}

function definedOrUndefined(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isEnabled(value: boolean | string | undefined): boolean {
  if (typeof value === 'boolean') return value;
  return value === 'true' || value === '1';
}

function settingsFromUrl(
  rawUrl: string,
  forceTls: boolean,
): RedisConnectionSettings {
  const parsed = new URL(rawUrl);
  const db = parsed.pathname.replace(/^\//, '');

  return {
    host: parsed.hostname || 'localhost',
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: db ? Number(db) : undefined,
    tls: parsed.protocol === 'rediss:' || forceTls,
  };
}

/**
 * Normalize REDIS_URL / the discrete REDIS_* variables into one settings
 * object. REDIS_URL wins when set (managed providers usually supply a single
 * URL); otherwise host/port/username/password/db/tls come from the individual
 * variables.
 */
export function redisConnectionSettings(
  config: ConfigService,
): RedisConnectionSettings {
  const forceTls = isEnabled(config.get<boolean | string>('REDIS_TLS'));
  const url = definedOrUndefined(config.get<string>('REDIS_URL'));

  if (url) return settingsFromUrl(url, forceTls);

  const db = definedOrUndefined(config.get<string>('REDIS_DB'));

  return {
    host: definedOrUndefined(config.get<string>('REDIS_HOST')) ?? 'localhost',
    port: Number(definedOrUndefined(config.get<string>('REDIS_PORT')) ?? 6379),
    username: definedOrUndefined(config.get<string>('REDIS_USERNAME')),
    password: definedOrUndefined(config.get<string>('REDIS_PASSWORD')),
    db: db !== undefined ? Number(db) : undefined,
    tls: forceTls,
  };
}

/** ioredis options, used by the shared REDIS_CLIENT and BullMQ. */
export function redisOptionsFromSettings(
  settings: RedisConnectionSettings,
): RedisOptions {
  const options: RedisOptions = {
    host: settings.host,
    port: settings.port,
  };

  if (settings.username) options.username = settings.username;
  if (settings.password) options.password = settings.password;
  if (settings.db !== undefined) options.db = settings.db;
  if (settings.tls) options.tls = {};

  return options;
}

function urlAuth(settings: RedisConnectionSettings): string {
  if (!settings.username && !settings.password) return '';

  const username = settings.username ? encodeURIComponent(settings.username) : '';
  const password = settings.password
    ? `:${encodeURIComponent(settings.password)}`
    : '';

  return `${username}${password}@`;
}

/**
 * redis(s):// URL for clients that take a connection string. The Keyv cache
 * store uses node-redis rather than ioredis, so it cannot consume
 * RedisOptions directly.
 */
export function redisUrlFromSettings(
  settings: RedisConnectionSettings,
): string {
  const auth = urlAuth(settings);
  const db = settings.db !== undefined ? `/${settings.db}` : '';
  const protocol = settings.tls ? 'rediss' : 'redis';

  return `${protocol}://${auth}${settings.host}:${settings.port}${db}`;
}

export function buildRedisOptions(config: ConfigService): RedisOptions {
  return redisOptionsFromSettings(redisConnectionSettings(config));
}

export function buildRedisUrl(config: ConfigService): string {
  return redisUrlFromSettings(redisConnectionSettings(config));
}

/** Parse a redis(s):// URL into ioredis options. */
export function redisOptionsFromUrl(rawUrl: string): RedisOptions {
  return redisOptionsFromSettings(settingsFromUrl(rawUrl, false));
}
