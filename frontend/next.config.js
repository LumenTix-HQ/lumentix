const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  fallbacks: {
    document: "/offline",
  },
  runtimeCaching: [
    {
      urlPattern: /^https?.*\/events.*$/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "lumentix-api-events",
        expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 },
      },
    },
    {
      urlPattern: /\.(?:js|css|woff2|svg|png|jpg|jpeg|webp)$/i,
      handler: "CacheFirst",
      options: {
        cacheName: "lumentix-static-assets",
        expiration: { maxEntries: 128, maxAgeSeconds: 30 * 24 * 60 * 60 },
      },
    },
  ],
});

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

module.exports = withPWA(nextConfig);
