import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  // App
  PORT: Joi.number().default(3000),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),

  // Database
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),

  // JWT
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('1h'),

  // Stellar
  STELLAR_NETWORK: Joi.string().valid('testnet', 'mainnet').required(),
  HORIZON_URL: Joi.string().uri().required(),
  NETWORK_PASSPHRASE: Joi.string().required(),
  PLATFORM_PUBLIC_KEY: Joi.string().required(),
  PLATFORM_SECRET_KEY: Joi.string().required(),

  // Redis
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),

  // Ticket Signing
  TICKET_SIGNING_SECRET: Joi.string().required(),
  TICKET_SIGNING_PUBLIC_KEY: Joi.string().required(),

  // SMTP
  SMTP_HOST: Joi.string().required(),
  SMTP_PORT: Joi.number().required(),
  SMTP_USER: Joi.string().required(),
  SMTP_PASS: Joi.string().required(),
  MAIL_FROM: Joi.string().email().required(),

  // CORS
  CORS_ORIGIN: Joi.string().default('http://localhost:3000'),

  // Refund policy
  REFUND_CUTOFF_HOURS: Joi.number().default(24),
  FULL_REFUND_WINDOW_HOURS: Joi.number().default(48),
  PARTIAL_REFUND_RATE: Joi.number().default(0.5),

  // Audit retention
  AUDIT_RETENTION_DAYS: Joi.number().default(90),
});
