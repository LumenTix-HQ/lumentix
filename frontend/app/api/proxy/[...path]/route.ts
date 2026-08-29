import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

async function proxyRequest(
  request: NextRequest,
  path: string,
  accessToken?: string,
  refreshToken?: string,
): Promise<NextResponse> {
  const url = new URL(path, BACKEND_URL);
  url.search = request.nextUrl.search;

  const contentType = request.headers.get('content-type') ?? 'application/json';
  // Multipart bodies carry binary data and a boundary token; decoding them as
  // text corrupts the payload, so they are forwarded as raw bytes instead.
  const isBinaryBody = !contentType.includes('application/json');

  const headers = new Headers();
  headers.set('Content-Type', contentType);
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = isBinaryBody ? await request.arrayBuffer() : await request.text();
  }

  const backendResponse = await fetch(url.toString(), init);

  if (backendResponse.status === 401 && refreshToken) {
    const refreshRes = await fetch(`${BACKEND_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (refreshRes.ok) {
      const refreshData = await refreshRes.json();
      const retryHeaders = new Headers(headers);
      retryHeaders.set('Authorization', `Bearer ${refreshData.access_token}`);

      const retryRes = await fetch(url.toString(), { ...init, headers: retryHeaders });
      const body = await retryRes.text();

      const res = new NextResponse(body, { status: retryRes.status });
      res.headers.set('Content-Type', 'application/json');

      if (refreshData.access_token) {
        res.cookies.set('lumentix_access_token', refreshData.access_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 7,
        });
      }
      if (refreshData.refresh_token) {
        res.cookies.set('lumentix_refresh_token', refreshData.refresh_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 30,
        });
      }

      return res;
    }

    const clearRes = NextResponse.json({ message: 'Session expired' }, { status: 401 });
    clearRes.cookies.set('lumentix_access_token', '', { maxAge: 0, path: '/' });
    clearRes.cookies.set('lumentix_refresh_token', '', { maxAge: 0, path: '/' });
    return clearRes;
  }

  const body = await backendResponse.text();
  const res = new NextResponse(body, { status: backendResponse.status });
  res.headers.set('Content-Type', 'application/json');
  return res;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const accessToken = request.cookies.get('lumentix_access_token')?.value;
  const refreshToken = request.cookies.get('lumentix_refresh_token')?.value;
  return proxyRequest(request, path.join('/'), accessToken, refreshToken);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const accessToken = request.cookies.get('lumentix_access_token')?.value;
  const refreshToken = request.cookies.get('lumentix_refresh_token')?.value;
  return proxyRequest(request, path.join('/'), accessToken, refreshToken);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const accessToken = request.cookies.get('lumentix_access_token')?.value;
  const refreshToken = request.cookies.get('lumentix_refresh_token')?.value;
  return proxyRequest(request, path.join('/'), accessToken, refreshToken);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const accessToken = request.cookies.get('lumentix_access_token')?.value;
  const refreshToken = request.cookies.get('lumentix_refresh_token')?.value;
  return proxyRequest(request, path.join('/'), accessToken, refreshToken);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const accessToken = request.cookies.get('lumentix_access_token')?.value;
  const refreshToken = request.cookies.get('lumentix_refresh_token')?.value;
  return proxyRequest(request, path.join('/'), accessToken, refreshToken);
}
