const crypto = require("node:crypto");
const themeInit = require("./lib/theme-init.json");

// Hash of the exact inline script rendered by app/layout.tsx (THEME_INIT_SCRIPT).
// Keeping the hash in the CSP lets the theme bootstrap run without allowing
// arbitrary inline scripts.
const THEME_INIT_HASH = `'sha256-${crypto
  .createHash("sha256")
  .update(themeInit.script)
  .digest("base64")}'`;

// Event and sponsor logos are the only remote images next/image should fetch.
// Deployments extend the list with NEXT_PUBLIC_IMAGE_HOSTS (comma separated);
// the default covers the Unsplash placeholders used by the category pages.
const DEFAULT_IMAGE_HOSTS = ["images.unsplash.com"];

function getAllowedImageHosts(env = process.env) {
  const configured = (env.NEXT_PUBLIC_IMAGE_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

  return configured.length > 0 ? configured : DEFAULT_IMAGE_HOSTS;
}

function getAnalyticsOrigin(env = process.env) {
  const raw = (env.NEXT_PUBLIC_ANALYTICS_URL ?? "").trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function contentSecurityPolicy(env = process.env) {
  const isDev = env.NODE_ENV === "development";
  const analyticsOrigin = getAnalyticsOrigin(env);

  const connectSrc = [
    "'self'",
    "https://horizon-testnet.stellar.org",
    "https://horizon.stellar.org",
    "https://*.walletconnect.com",
    "wss://*.walletconnect.com",
  ];
  if (analyticsOrigin) connectSrc.push(analyticsOrigin);

  const scriptSrc = ["'self'", THEME_INIT_HASH];
  if (isDev) {
    // `next dev` compiles modules with eval and injects inline HMR scripts.
    scriptSrc.push("'unsafe-eval'", "'unsafe-inline'");
  }

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(" ")}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: {
    // Only https hosts explicitly configured here may be optimized by
    // next/image. Plain http is intentionally not allowed (mixed content and
    // SSRF against internal hosts).
    remotePatterns: getAllowedImageHosts().map((hostname) => ({
      protocol: "https",
      hostname,
    })),
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

module.exports = {
  nextConfig,
  DEFAULT_IMAGE_HOSTS,
  THEME_INIT_HASH,
  contentSecurityPolicy,
  getAllowedImageHosts,
};
