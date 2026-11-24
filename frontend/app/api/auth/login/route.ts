import { NextRequest, NextResponse } from 'next/server';

/**
 * Credential login route.
 *
 * The route only ever sets session cookies derived from the backend's
 * /auth/login response. It deliberately does **not** accept caller-supplied
 * access/refresh tokens: doing so allowed session fixation (an attacker could
 * hand a victim their own tokens) and login CSRF, and `request.json()` parses
 * any content type.
 */
export async function POST(request: NextRequest) {
  // Require a JSON body — `request.json()` would otherwise parse text/plain,
  // which is exactly what a cross-site HTML form can send.
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return NextResponse.json(
      { message: 'Content-Type must be application/json' },
      { status: 415 },
    );
  }

  // Reject cross-site callers. `Origin` is present on all browser fetch/form
  // POSTs; `Sec-Fetch-Site` catches browsers that strip it.
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }
  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

  const response = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: body.email, password: body.password }),
  });

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json(data, { status: response.status });
  }

  const accessToken = data.accessToken ?? data.access_token;
  const refreshToken = data.refreshToken ?? data.refresh_token;

  if (!accessToken) {
    return NextResponse.json(
      { message: 'Authentication failed' },
      { status: 502 },
    );
  }

  const res = NextResponse.json(
    { accessToken, refreshToken, user: data.user },
    { status: 200 },
  );
  setAuthCookies(res, accessToken, refreshToken);
  return res;
}

function setAuthCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken?: string,
) {
  response.cookies.set('lumentix_access_token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  if (refreshToken) {
    response.cookies.set('lumentix_refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }
}
