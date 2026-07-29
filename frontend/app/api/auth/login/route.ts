import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const suppliedAccessToken = body.accessToken ?? body.access_token;
  const suppliedRefreshToken = body.refreshToken ?? body.refresh_token;

  if (suppliedAccessToken && suppliedRefreshToken) {
    const response = NextResponse.json({ ok: true });
    setAuthCookies(response, suppliedAccessToken, suppliedRefreshToken);
    return response;
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

  const response = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json(data, { status: response.status });
  }

  const accessToken = data.accessToken ?? data.access_token;
  const refreshToken = data.refreshToken ?? data.refresh_token;
  const res = NextResponse.json({ accessToken, refreshToken, user: data.user }, { status: 200 });
  setAuthCookies(res, accessToken, refreshToken);
  return res;
}

function setAuthCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
) {
  response.cookies.set('lumentix_access_token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  response.cookies.set('lumentix_refresh_token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}
