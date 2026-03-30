import { envValidationSchema } from './env.validation';

describe('envValidationSchema', () => {
  it('should fail when required variables are missing and return multiple errors', () => {
    const { error } = envValidationSchema.validate({}, { abortEarly: false });

    expect(error).toBeDefined();
    expect(error?.details.length).toBeGreaterThan(1);

    const messages = error?.details.map((d) => d.message) ?? [];
    expect(messages).toEqual(expect.arrayContaining([expect.stringContaining('DB_HOST'), expect.stringContaining('JWT_SECRET'), expect.stringContaining('STELLAR_NETWORK')]));
  });

  it('should pass when all required variables are valid', () => {
    const { error, value } = envValidationSchema.validate(
      {
        PORT: 3000,
        NODE_ENV: 'development',
        DB_HOST: 'localhost',
        DB_PORT: 5432,
        DB_USERNAME: 'postgres',
        DB_PASSWORD: 'postgres',
        DB_NAME: 'lumentix_db',
        JWT_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
        JWT_EXPIRES_IN: '2h',
        STELLAR_NETWORK: 'testnet',
        HORIZON_URL: 'https://horizon-testnet.stellar.org',
        NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
        PLATFORM_PUBLIC_KEY: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        PLATFORM_SECRET_KEY: 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        REDIS_HOST: 'localhost',
        REDIS_PORT: 6379,
        TICKET_SIGNING_SECRET: 'ticket-signing-secret',
        TICKET_SIGNING_PUBLIC_KEY: 'ticket-signing-public-key',
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: 587,
        SMTP_USER: 'user',
        SMTP_PASS: 'pass',
        MAIL_FROM: 'admin@example.com',
      },
      { abortEarly: false },
    );

    expect(error).toBeUndefined();
    expect(value.PORT).toBe(3000);
    expect(value.NODE_ENV).toBe('development');
  });

  it('should fail when JWT_SECRET is shorter than 32 chars', () => {
    const { error } = envValidationSchema.validate(
      {
        DB_HOST: 'localhost',
        DB_USERNAME: 'postgres',
        DB_PASSWORD: 'postgres',
        DB_NAME: 'lumentix',
        JWT_SECRET: 'short-secret',
        STELLAR_NETWORK: 'testnet',
        HORIZON_URL: 'https://horizon-testnet.stellar.org',
        NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
        PLATFORM_PUBLIC_KEY: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        PLATFORM_SECRET_KEY: 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        TICKET_SIGNING_SECRET: 'ticket-signing-secret',
        TICKET_SIGNING_PUBLIC_KEY: 'ticket-signing-public-key',
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: 587,
        SMTP_USER: 'user',
        SMTP_PASS: 'pass',
        MAIL_FROM: 'admin@example.com',
      },
      { abortEarly: false },
    );

    expect(error).toBeDefined();
    expect(error?.details.some((d) => d.path.includes('JWT_SECRET'))).toBeTruthy();
  });

  it('should fail when NODE_ENV is invalid', () => {
    const { error } = envValidationSchema.validate(
      {
        PORT: 3000,
        NODE_ENV: 'invalid-env',
        DB_HOST: 'localhost',
        DB_USERNAME: 'postgres',
        DB_PASSWORD: 'postgres',
        DB_NAME: 'lumentix',
        JWT_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
        STELLAR_NETWORK: 'testnet',
        HORIZON_URL: 'https://horizon-testnet.stellar.org',
        NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
        PLATFORM_PUBLIC_KEY: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        PLATFORM_SECRET_KEY: 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        TICKET_SIGNING_SECRET: 'ticket-signing-secret',
        TICKET_SIGNING_PUBLIC_KEY: 'ticket-signing-public-key',
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: 587,
        SMTP_USER: 'user',
        SMTP_PASS: 'pass',
        MAIL_FROM: 'admin@example.com',
      },
      { abortEarly: false },
    );

    expect(error).toBeDefined();
    expect(error?.details.some((d) => d.path.includes('NODE_ENV'))).toBeTruthy();
  });
});
