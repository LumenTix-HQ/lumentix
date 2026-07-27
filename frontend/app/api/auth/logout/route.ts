import { NextResponse } from 'next/server';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set('lumentix_access_token', '', { maxAge: 0, path: '/' });
  res.cookies.set('lumentix_refresh_token', '', { maxAge: 0, path: '/' });
  return res;
}
