import { NextResponse } from 'next/server';

export function GET() {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://lumentix.app').replace(/\/$/, '');

  // The sitemap now enumerates public catalog pages (events, categories,
  // venue capacity). Everything below is either private, user-specific, or an
  // internal endpoint that should never be indexed. Public catalog routes are
  // intentionally left crawlable.
  const body = [
    'User-agent: *',
    'Disallow: /admin/',
    'Disallow: /api/',
    'Disallow: /organizer/',
    'Disallow: /my-tickets',
    'Disallow: /my-payments',
    'Disallow: /profile',
    'Disallow: /reset-password',
    'Disallow: /forgot-password',
    '',
    `Sitemap: ${appUrl}/sitemap.xml`,
    '',
  ].join('\n');

  return new NextResponse(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
