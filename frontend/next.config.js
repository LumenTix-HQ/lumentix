const createNextIntlPlugin = require("next-intl/plugin");
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Offline support is provided by the hand-written public/sw.js (app shell cache, event/ticket
// data cache, push notifications and background sync), registered by app/ServiceWorkerRegister.tsx.
// next-pwa is intentionally not used: it would generate its own public/sw.js and overwrite that file.

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: {
    // Event images come from arbitrary organizer-provided URLs, so allow any
    // https host to be optimized by next/image.
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
};

module.exports = withNextIntl(nextConfig);
