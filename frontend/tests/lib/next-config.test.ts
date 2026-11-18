import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  nextConfig,
  contentSecurityPolicy,
  getAllowedImageHosts,
  DEFAULT_IMAGE_HOSTS,
  THEME_INIT_HASH,
} = require('../../next.config.base.js');

describe('next.config image allowlist', () => {
  it('only allows https remote patterns', () => {
    expect(nextConfig.images.remotePatterns.length).toBeGreaterThan(0);
    for (const pattern of nextConfig.images.remotePatterns) {
      expect(pattern.protocol).toBe('https');
    }
  });

  it('never allows a wildcard host', () => {
    const hosts = nextConfig.images.remotePatterns.map(
      (pattern: { hostname: string }) => pattern.hostname,
    );
    expect(hosts).not.toContain('**');
    expect(hosts).not.toContain('*');
  });

  it('defaults to the known static image hosts when nothing is configured', () => {
    expect(getAllowedImageHosts({})).toEqual(DEFAULT_IMAGE_HOSTS);
  });

  it('reads extra hosts from NEXT_PUBLIC_IMAGE_HOSTS', () => {
    expect(
      getAllowedImageHosts({
        NEXT_PUBLIC_IMAGE_HOSTS: ' cdn.example.com, images.example.org ,,',
      }),
    ).toEqual(['cdn.example.com', 'images.example.org']);
  });
});

describe('next.config security headers', () => {
  it('sets a CSP with a hash for the inline theme bootstrap', () => {
    expect(THEME_INIT_HASH).toMatch(/^'sha256-[A-Za-z0-9+/=]+'$/);
    expect(contentSecurityPolicy({})).toContain(`script-src 'self' ${THEME_INIT_HASH}`);
  });

  it('forbids framing and other baseline protections', async () => {
    const rules = await nextConfig.headers();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe('/:path*');

    const headers = Object.fromEntries(
      rules[0].headers.map((header: { key: string; value: string }) => [
        header.key,
        header.value,
      ]),
    );

    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(headers['Content-Security-Policy']).toContain("object-src 'none'");
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Permissions-Policy']).toContain('camera=()');
  });

  it('allows the configured analytics origin in connect-src only when valid', () => {
    const withAnalytics = contentSecurityPolicy({
      NEXT_PUBLIC_ANALYTICS_URL: 'https://analytics.example.com/script.js',
    });
    expect(withAnalytics).toContain('connect-src');
    expect(withAnalytics).toContain('https://analytics.example.com');

    expect(contentSecurityPolicy({ NEXT_PUBLIC_ANALYTICS_URL: 'not a url' })).not.toContain(
      'not a url',
    );
  });
});
