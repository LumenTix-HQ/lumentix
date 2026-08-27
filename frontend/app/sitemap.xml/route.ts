import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// The sitemap is generated from live catalog data (events, categories, venues)
// fetched from the backend at request time and cached via ISR. If the backend
// is unreachable we still emit the static marketing pages so the sitemap is
// never empty.
// ---------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

// Revalidate the generated sitemap hourly (ISR).
export const revalidate = 3600;

// Cap the number of events we enumerate so a very large catalog can't produce a
// multi-megabyte sitemap in a single request.
const MAX_EVENTS = 5000;
const PAGE_SIZE = 100;

const STATIC_PAGES: Array<{ path: string; changefreq: string; priority: string }> = [
  { path: '', changefreq: 'daily', priority: '1.0' },
  { path: '/events', changefreq: 'daily', priority: '0.9' },
  { path: '/categories', changefreq: 'weekly', priority: '0.7' },
  { path: '/create', changefreq: 'monthly', priority: '0.5' },
];

interface SitemapEvent {
  id: string;
  status?: string;
  updatedAt?: string;
}

interface SitemapCategory {
  slug: string;
  updatedAt?: string;
}

function xmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unwrap<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: T[] }).data;
  }
  return [];
}

async function fetchAllPublishedEvents(): Promise<SitemapEvent[]> {
  const collected: SitemapEvent[] = [];
  try {
    for (let page = 1; collected.length < MAX_EVENTS; page++) {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        status: 'published',
      });
      const res = await fetch(`${API_BASE}/events?${params}`, {
        next: { revalidate },
      });
      if (!res.ok) break;
      const items = unwrap<SitemapEvent>(await res.json());
      if (items.length === 0) break;
      collected.push(...items);
      if (items.length < PAGE_SIZE) break;
    }
  } catch {
    // Network/backend failure — fall back to whatever we collected so far.
  }
  // Defend against a backend that ignores the status filter.
  return collected
    .filter((e) => e && e.id && (e.status === undefined || e.status === 'published'))
    .slice(0, MAX_EVENTS);
}

async function fetchCategories(): Promise<SitemapCategory[]> {
  try {
    const res = await fetch(`${API_BASE}/categories`, { next: { revalidate } });
    if (!res.ok) return [];
    return unwrap<SitemapCategory>(await res.json()).filter((c) => c && c.slug);
  } catch {
    return [];
  }
}

function urlEntry(
  loc: string,
  lastmod: string,
  changefreq: string,
  priority: string,
): string {
  return `
  <url>
    <loc>${xmlEscape(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

export async function GET() {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://lumentix.app').replace(/\/$/, '');
  const today = new Date().toISOString().split('T')[0];

  const [events, categories] = await Promise.all([
    fetchAllPublishedEvents(),
    fetchCategories(),
  ]);

  const staticUrls = STATIC_PAGES.map((p) =>
    urlEntry(`${appUrl}${p.path}`, today, p.changefreq, p.priority),
  ).join('');

  const categoryUrls = categories
    .map((c) =>
      urlEntry(
        `${appUrl}/categories/${c.slug}`,
        (c.updatedAt ?? today).split('T')[0],
        'weekly',
        '0.7',
      ),
    )
    .join('');

  // Each event contributes its detail page and its (public) venue capacity page.
  const eventUrls = events
    .map((e) => {
      const lastmod = (e.updatedAt ?? today).split('T')[0];
      return (
        urlEntry(`${appUrl}/events/${e.id}`, lastmod, 'daily', '0.9') +
        urlEntry(`${appUrl}/venues/${e.id}/capacity`, lastmod, 'daily', '0.6')
      );
    })
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${staticUrls}${categoryUrls}${eventUrls}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
