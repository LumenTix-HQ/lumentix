import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const BACKEND_ORIGIN = new URL(BACKEND_URL).origin;

/** Top-level backend prefixes the browser is never allowed to reach via the proxy. */
const BLOCKED_PREFIXES = ['internal'];

function badRequest(message: string): NextResponse {
  return NextResponse.json({ message }, { status: 400 });
}

/**
 * A catch-all segment is only safe when it is a plain path fragment. Rejecting
 * ':' and leading '/' prevents a crafted path (e.g. `https://attacker/...`)
 * from escaping the configured backend origin — the proxy attaches the caller's
 * bearer token, so forwarding it elsewhere would leak the session.
 */
function isSafeSegment(segment: string): boolean {
  return (
    segment.length > 0 &&
    !segment.includes(':') &&
    !segment.includes('\\') &&
    !segment.startsWith('/')
  );
}

/**
 * Resolve the upstream URL for the given path segments, or `null` when the
 * request must be rejected. Every segment is percent-encoded and the join is
 * anchored to the backend origin, then re-checked after resolution.
 */
function resolveUpstreamUrl(
  segments: string[],
  search: string,
): URL | null {
  if (segments.length === 0 || !segments.every(isSafeSegment)) {
    return null;
  }

  if (BLOCKED_PREFIXES.includes(segments[0])) {
    return null;
  }

  const encodedPath = '/' + segments.map(encodeURIComponent).join('/');

  let url: URL;
  try {
    url = new URL(encodedPath, BACKEND_URL);
  } catch {
    return null;
  }

  if (url.origin !== BACKEND_ORIGIN) {
    return null;
  }

  url.search = search;
  return url;
}

/** Copy the upstream body and the response headers we care about preserving. */
async function forwardResponse(upstream: Response): Promise<NextResponse> {
  // Read raw bytes so binary responses (QR images) are not corrupted and text
  // responses (iCal/CSV) keep their encoding.
  const buffer = await upstream.arrayBuffer();
  const res = new NextResponse(buffer, { status: upstream.status });

  const contentType = upstream.headers.get('content-type');
  if (contentType) {
    res.headers.set('Content-Type', contentType);
  }
  const contentDisposition = upstream.headers.get('content-disposition');
  if (contentDisposition) {
    res.headers.set('Content-Disposition', contentDisposition);
  }
  return res;
}

async function proxyRequest(
  request: NextRequest,
  segments: string[],
  accessToken?: string,
  refreshToken?: string,
): Promise<NextResponse> {
  const url = resolveUpstreamUrl(segments, request.nextUrl.search);
  if (!url) {
    return badRequest('Invalid proxy path');
  }

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
      const res = await forwardResponse(retryRes);

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

  return forwardResponse(backendResponse);
}

async function handle(
  request: NextRequest,
  params: Promise<{ path: string[] }>,
): Promise<NextResponse> {
  const { path } = await params;
  const accessToken = request.cookies.get('lumentix_access_token')?.value;
  const refreshToken = request.cookies.get('lumentix_refresh_token')?.value;
  return proxyRequest(request, path ?? [], accessToken, refreshToken);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return handle(request, params);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return handle(request, params);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return handle(request, params);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return handle(request, params);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return handle(request, params);
}
