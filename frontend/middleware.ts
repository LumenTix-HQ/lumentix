import { NextRequest, NextResponse } from 'next/server';

export const config = {
  matcher: ['/create', '/my-tickets', '/organizer/:path*', '/profile', '/admin/:path*'],
};

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

export default function middleware(req: NextRequest) {
  const token = req.cookies.get('lumentix_access_token')?.value;
  const url = req.nextUrl.clone();

  if (!token || isExpired(token)) {
    url.pathname = '/login';
    url.searchParams.set('redirect', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (req.nextUrl.pathname.startsWith('/organizer')) {
    const role = decodeRole(token);
    if (role !== 'organizer' && role !== 'admin') {
      url.pathname = '/';
      url.searchParams.delete('redirect');
      return NextResponse.redirect(url);
    }
  }

  if (req.nextUrl.pathname.startsWith('/admin')) {
    const role = decodeRole(token);
    if (role !== 'admin') {
      url.pathname = '/';
      url.searchParams.delete('redirect');
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}
