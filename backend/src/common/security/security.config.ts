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
 * Helmet configuration.
 * Content-Security-Policy is relaxed just enough for Swagger UI to work.
 */
export const helmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Swagger UI needs inline styles
      imgSrc: ["'self'", 'data:', 'validator.swagger.io'],
      scriptSrc: ["'self'", "https: 'unsafe-inline'"], // Swagger UI scripts
    },
  },
};
