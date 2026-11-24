const createNextIntlPlugin = require("next-intl/plugin");
const { nextConfig } = require("./next.config.base");
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Offline support is provided by the hand-written public/sw.js (app shell cache, event/ticket
// data cache, push notifications and background sync), registered by app/ServiceWorkerRegister.tsx.
// next-pwa is intentionally not used: it would generate its own public/sw.js and overwrite that file.
//
// Image allowlists, security headers and the CSP live in next.config.base.js so they can be
// unit tested without loading the next-intl plugin.

module.exports = withNextIntl(nextConfig);
