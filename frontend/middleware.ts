import { NextRequest, NextResponse } from 'next/server';
import { isTokenExpired, decodeJwtRole } from '@/lib/auth/token';
import { hasRole, ROLES } from '@/lib/auth/roles';

export const config = {
  matcher: ['/create', '/my-tickets', '/organizer/:path*', '/profile', '/admin/:path*'],
};

export default function middleware(req: NextRequest) {
  const token = req.cookies.get('lumentix_access_token')?.value;
  const url = req.nextUrl.clone();

  if (!token || isTokenExpired(token)) {
    url.pathname = '/login';
    url.searchParams.set('redirect', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (req.nextUrl.pathname.startsWith('/organizer')) {
    const role = decodeJwtRole(token);
    if (!hasRole(role, ROLES.ORGANIZER, ROLES.ADMIN)) {
      url.pathname = '/';
      url.searchParams.delete('redirect');
      return NextResponse.redirect(url);
    }
  }

  if (req.nextUrl.pathname.startsWith('/admin')) {
    const role = decodeJwtRole(token);
    if (!hasRole(role, ROLES.ADMIN)) {
      url.pathname = '/';
      url.searchParams.delete('redirect');
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}
