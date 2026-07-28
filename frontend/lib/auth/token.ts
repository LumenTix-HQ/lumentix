import type { NextRequest } from 'next/server';

/**
 * Reads the lumentix_access_token cookie from a Next.js request.
 */
export function getTokenFromCookies(req: NextRequest): string | undefined {
  return req.cookies.get('lumentix_access_token')?.value;
}

/**
 * Base64url-decodes the JWT payload and returns the `role` claim string.
 * Returns an empty string if decoding fails or role is absent.
 */
export function decodeJwtRole(token: string): string {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return '';
    // Convert base64url → base64 → decode
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(payload, 'base64').toString('utf-8');
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return typeof parsed.role === 'string' ? parsed.role : '';
  } catch {
    return '';
  }
}

/**
 * Returns true when the JWT `exp` claim is in the past or absent.
 */
export function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(payload, 'base64').toString('utf-8');
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (typeof parsed.exp !== 'number') return true;
    return Date.now() / 1000 > parsed.exp;
  } catch {
    return true;
  }
}
