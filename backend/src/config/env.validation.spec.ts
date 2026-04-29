import { envValidationSchema } from './env.validation';

function buildEnv(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    DB_HOST: 'localhost',
    DB_PORT: 5432,
    DB_USERNAME: 'pg',
    DB_PASSWORD: 'pg',
    DB_NAME: 'lumentix',
    JWT_SECRET: 'a'.repeat(32),
    STELLAR_NETWORK: 'testnet',
    HORIZON_URL: 'https://horizon-testnet.stellar.org',
    NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
    PLATFORM_PUBLIC_KEY: 'G' + 'A'.repeat(55),
    PLATFORM_SECRET_KEY: 'S' + 'A'.repeat(55),
    TICKET_SIGNING_SECRET: 'signing-secret',
    TICKET_SIGNING_PUBLIC_KEY: 'pub-key',
    SMTP_HOST: 'smtp.test.com',
    SMTP_PORT: 587,
    SMTP_USER: 'user@test.com',
    SMTP_PASS: 'pass',
    MAIL_FROM: 'noreply@test.com',
    ...overrides,
  };
}

describe('envValidationSchema', () => {
  it('validates successfully with all required fields', () => {
    const { error, value } = envValidationSchema.validate(buildEnv(), { abortEarly: false });
    expect(error).toBeUndefined();
    expect(value).toBeDefined();
  });

  it('fails when DB_HOST is missing', () => {
    const env = buildEnv();
    delete (env as Record<string, unknown>).DB_HOST;
    const { error } = envValidationSchema.validate(env, { abortEarly: false });
    expect(error).toBeDefined();
    expect(error?.details.some((d) => d.path.includes('DB_HOST'))).toBe(true);
  });

  it('fails when JWT_SECRET is shorter than 32 characters', () => {
    const { error } = envValidationSchema.validate(
      buildEnv({ JWT_SECRET: 'tooshort' }),
      { abortEarly: false },
    );
    expect(error).toBeDefined();
    expect(error?.details.some((d) => d.path.includes('JWT_SECRET'))).toBe(true);
  });

  it('fails when STELLAR_NETWORK is not testnet or mainnet', () => {
    const { error } = envValidationSchema.validate(
      buildEnv({ STELLAR_NETWORK: 'devnet' }),
      { abortEarly: false },
    );
    expect(error).toBeDefined();
    expect(error?.details.some((d) => d.path.includes('STELLAR_NETWORK'))).toBe(true);
  });

  it('fails when MAIL_FROM is not a valid email', () => {
    const { error } = envValidationSchema.validate(
      buildEnv({ MAIL_FROM: 'not-an-email' }),
      { abortEarly: false },
    );
    expect(error).toBeDefined();
    expect(error?.details.some((d) => d.path.includes('MAIL_FROM'))).toBe(true);
  });

  it('applies default PORT = 3000 when not set', () => {
    const { value } = envValidationSchema.validate(buildEnv(), { abortEarly: false });
    expect(value.PORT).toBe(3000);
  });

  it('applies default NODE_ENV = development when not set', () => {
    const { value } = envValidationSchema.validate(buildEnv(), { abortEarly: false });
    expect(value.NODE_ENV).toBe('development');
  });

  it('applies default AUDIT_RETENTION_DAYS = 90 when not set', () => {
    const { value } = envValidationSchema.validate(buildEnv(), { abortEarly: false });
    expect(value.AUDIT_RETENTION_DAYS).toBe(90);
  });

  it('reports ALL missing required fields at once (abortEarly: false)', () => {
    const { error } = envValidationSchema.validate({}, { abortEarly: false });
    expect(error).toBeDefined();
    expect(error!.details.length).toBeGreaterThan(1);
  });

  it('applies default REFUND_CUTOFF_HOURS = 24 when not set', () => {
    const { value } = envValidationSchema.validate(buildEnv(), { abortEarly: false });
    expect(value.REFUND_CUTOFF_HOURS).toBe(24);
  });

  it('accepts REFUND_CUTOFF_HOURS when explicitly set', () => {
    const { error, value } = envValidationSchema.validate(
      buildEnv({ REFUND_CUTOFF_HOURS: 48 }),
      { abortEarly: false },
    );
    expect(error).toBeUndefined();
    expect(value.REFUND_CUTOFF_HOURS).toBe(48);
  });

  it('accepts mainnet as a valid STELLAR_NETWORK value', () => {
    const { error } = envValidationSchema.validate(
      buildEnv({ STELLAR_NETWORK: 'mainnet' }),
      { abortEarly: false },
    );
    expect(error).toBeUndefined();
  });
});
