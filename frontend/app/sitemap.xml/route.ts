import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Static event slugs (replace with a real API call in production)
// ---------------------------------------------------------------------------
const STATIC_EVENT_IDS = [
  'e1a2b3c4-d5e6-7890-abcd-ef1234567890',
  'f2b3c4d5-e6f7-8901-bcde-f12345678901',
  'a3c4d5e6-f7a8-9012-cdef-123456789012',
  'b4d5e6f7-a8b9-0123-defa-234567890123',
  'c5e6f7a8-b9c0-1234-efab-345678901234',
  'd6f7a8b9-c0d1-2345-fabc-456789012345',
  'e7a8b9c0-d1e2-3456-abcd-567890123456',
];

const STATIC_PAGES = [
  '',        // home
  '/events',
  '/create',
];

function xmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET() {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://lumentix.app').replace(/\/$/, '');
  const today = new Date().toISOString().split('T')[0];

  const staticUrls = STATIC_PAGES.map(
    (path) => `
  <url>
    <loc>${xmlEscape(`${appUrl}${path}`)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${path === '' ? '1.0' : '0.8'}</priority>
  </url>`,
  ).join('');

  const eventUrls = STATIC_EVENT_IDS.map(
    (id) => `
  <url>
    <loc>${xmlEscape(`${appUrl}/events/${id}`)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>`,
  ).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${staticUrls}${eventUrls}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}
