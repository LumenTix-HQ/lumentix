import { describe, it, expect } from 'vitest';
import { loginSchema, registerSchema } from '@/lib/schemas/auth.schema';

describe('loginSchema', () => {
  it('accepts a valid email and non-empty password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const r = loginSchema.safeParse({ email: 'nope', password: 'x' });
    expect(r.success).toBe(false);
  });

  it('rejects an empty password', () => {
    const r = loginSchema.safeParse({ email: 'a@b.com', password: '' });
    expect(r.success).toBe(false);
  });
});

describe('registerSchema', () => {
  const base = {
    email: 'a@b.com',
    displayName: 'Alice',
    password: 'password1',
    confirmPassword: 'password1',
  };

  it('accepts a valid registration', () => {
    expect(registerSchema.safeParse(base).success).toBe(true);
  });

  it('requires a number in the password', () => {
    const r = registerSchema.safeParse({ ...base, password: 'passwordx', confirmPassword: 'passwordx' });
    expect(r.success).toBe(false);
  });

  it('flags mismatched confirmPassword on the confirmPassword path', () => {
    const r = registerSchema.safeParse({ ...base, confirmPassword: 'different1' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path[0] === 'confirmPassword')).toBe(true);
    }
  });

  it('allows an empty display name', () => {
    expect(registerSchema.safeParse({ ...base, displayName: '' }).success).toBe(true);
  });
});
