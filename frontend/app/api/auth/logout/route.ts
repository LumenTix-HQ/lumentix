import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Session logout route.
 *
 * Revokes the refresh token at the backend (`POST /auth/logout`) using the
 * access token + refresh token held in the httpOnly cookies, then clears both
 * cookies. Revocation is best-effort: if the backend is unreachable or the
 * tokens are already invalid we must still drop the cookies so the browser
 * session ends.
 */
export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get('lumentix_access_token')?.value;
  const refreshToken = request.cookies.get('lumentix_refresh_token')?.value;

  // The backend logout is JWT-guarded and requires the refresh token, so only
  // call it when we actually have a session to revoke.
  if (accessToken && refreshToken) {
    try {
      await fetch(`${BACKEND_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // Ignore — the cookies are cleared below regardless.
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('lumentix_access_token', '', { maxAge: 0, path: '/' });
  res.cookies.set('lumentix_refresh_token', '', { maxAge: 0, path: '/' });
  return res;
}
