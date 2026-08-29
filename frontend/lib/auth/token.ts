import type { NextRequest } from 'next/server';

export interface JwtPayload {
  sub?: string;
  email?: string;
  role?: string;
  exp?: number;
  [key: string]: unknown;
}

/**
 * Reads the lumentix_access_token cookie from a Next.js request.
 */
export function getTokenFromCookies(req: NextRequest): string | undefined {
  return req.cookies.get('lumentix_access_token')?.value;
}

/**
 * Edge-runtime- and browser-compatible base64url decode. Uses `atob`, which is
 * available in the Edge middleware runtime, browsers, and Node (>= 16) / jsdom.
 * `Buffer` is deliberately NOT used because it is unavailable in the Edge
 * runtime that `middleware.ts` runs in.
 */
function base64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return atob(padded);
}

/**
 * Decodes and JSON-parses a JWT payload. Returns null for malformed tokens.
 * This is the single JWT-decode implementation used across the frontend.
 */
export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(base64UrlDecode(parts[1])) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Returns the `role` claim string, or an empty string if decoding fails or the
 * claim is absent.
 */
export function decodeJwtRole(token: string): string {
  const payload = decodeJwtPayload(token);
  return payload && typeof payload.role === 'string' ? payload.role : '';
}

/**
 * Returns true when the JWT `exp` claim is in the past, absent, or the token is
 * malformed.
 */
export function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return true;
  return Date.now() / 1000 > payload.exp;
}
