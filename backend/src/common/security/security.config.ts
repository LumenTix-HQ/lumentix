import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Allowed origins. In production, replace with your real frontend domain(s).
 * Reads from CORS_ORIGINS env var (comma-separated) or falls back to localhost.
 */
function getAllowedOrigins(): string[] {
  const env = process.env.CORS_ORIGIN;
  if (env) return env.split(',').map((o) => o.trim());
  return ['http://localhost:3000', 'http://localhost:5173'];
}

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow server-to-server / curl requests with no Origin header
    if (!origin) return callback(null, true);

    const allowed = getAllowedOrigins();
    if (allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin "${origin}" is not allowed`));
    }
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

/**
 * Strict policy for API responses: scripts only from this origin, no
 * plugins, no framing, fixed base URI.
 */
export const strictCspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'"],
  imgSrc: ["'self'", 'data:'],
  objectSrc: ["'none'"],
  frameAncestors: ["'none'"],
  baseUri: ["'self'"],
};

/**
 * Swagger UI needs inline scripts/styles. This relaxed policy is only used
 * for the docs route, which is not served in production.
 */
export const swaggerCspDirectives = {
  ...strictCspDirectives,
  scriptSrc: ["'self'", "'unsafe-inline'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", 'data:', 'validator.swagger.io'],
};

/** Helmet configuration for all API responses. */
export const helmetOptions = {
  contentSecurityPolicy: {
    directives: strictCspDirectives,
  },
};

/** Helmet configuration for the Swagger UI route only. */
export const swaggerHelmetOptions = {
  contentSecurityPolicy: {
    directives: swaggerCspDirectives,
  },
};
