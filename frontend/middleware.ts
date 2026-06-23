import { NextRequest, NextResponse } from 'next/server';

// Routes protected by authentication (and optional role check)
export const config = {
  matcher: ['/my-tickets', '/organizer/:path*', '/events/:path*/checkout'],
};

// ---------------------------------------------------------------------------
// Inline helpers (keep middleware edge-compatible — no Node.js-only imports)
// ---------------------------------------------------------------------------

function isExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded);
    const payload = JSON.parse(json) as Record<string, unknown>;
    if (typeof payload.exp !== 'number') return true;
    return Date.now() / 1000 > payload.exp;
  } catch {
    return true;
  }
}

function decodeRole(token: string): string {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return '';
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded);
    const payload = JSON.parse(json) as Record<string, unknown>;
    return typeof payload.role === 'string' ? payload.role : '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export default function middleware(req: NextRequest) {
  const token = req.cookies.get('lumentix_access_token')?.value;
  const url = req.nextUrl.clone();

  // Redirect unauthenticated / expired-token requests to /login
  if (!token || isExpired(token)) {
    url.pathname = '/login';
    url.searchParams.set('redirect', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // Role guard for /organizer/* routes
  if (req.nextUrl.pathname.startsWith('/organizer')) {
    const role = decodeRole(token);
    if (role !== 'organizer' && role !== 'admin') {
      url.pathname = '/';
      url.searchParams.delete('redirect');
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}
