import { NextResponse } from 'next/server';

export function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://lumentix.app';

  const body = [
    'User-agent: *',
    'Disallow: /admin/',
    'Disallow: /api/',
    'Disallow: /organizer/',
    'Disallow: /my-tickets',
    '',
    `Sitemap: ${appUrl}/sitemap.xml`,
    '',
  ].join('\n');

  return new NextResponse(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
