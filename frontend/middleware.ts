import { NextRequest, NextResponse } from 'next/server';
import { isTokenExpired, decodeJwtRole } from '@/lib/auth/token';

/**
 * Pages that require an authenticated user. `/events/:id/analytics` and
 * `/venues/:eventId/capacity` are additionally organizer/admin-only; their
 * backend controllers use JwtAuthGuard + RolesGuard(ORGANIZER).
 */
export const config = {
  matcher: [
    '/create',
    '/my-tickets',
    '/my-payments',
    '/reviews',
    '/scheduling',
    '/gamification',
    '/insurance',
    '/resale',
    '/profile',
    '/organizer/:path*',
    '/admin/:path*',
    '/events/:id/analytics',
    '/venues/:eventId/capacity',
  ],
};

const ORGANIZER_ROUTE_PATTERNS = [
  /^\/organizer(?:\/|$)/,
  /^\/events\/[^/]+\/analytics(?:\/|$)/,
  /^\/venues\/[^/]+\/capacity(?:\/|$)/,
];

function isOrganizerRoute(pathname: string): boolean {
  return ORGANIZER_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));
}

export default function middleware(req: NextRequest) {
  const token = req.cookies.get('lumentix_access_token')?.value;
  const url = req.nextUrl.clone();
  const pathname = req.nextUrl.pathname;

  if (!token || isTokenExpired(token)) {
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  if (isOrganizerRoute(pathname)) {
    const role = decodeJwtRole(token);
    if (role !== 'organizer' && role !== 'admin') {
      url.pathname = '/';
      url.searchParams.delete('redirect');
      return NextResponse.redirect(url);
    }
  }

  if (pathname.startsWith('/admin')) {
    const role = decodeJwtRole(token);
    if (role !== 'admin') {
      url.pathname = '/';
      url.searchParams.delete('redirect');
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}
