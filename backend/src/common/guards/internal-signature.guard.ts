import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac } from 'crypto';
import { Request } from 'express';

/** Maximum age of a signed request before it is considered stale (30 seconds). */
const MAX_TIMESTAMP_AGE_MS = 30_000;

/**
 * Guards routes under `/internal/*` by verifying an HMAC-SHA256 signature.
 *
 * Expected request headers:
 *   X-Timestamp         — Unix epoch in milliseconds (string)
 *   X-Internal-Signature — hex(HMAC-SHA256(`${timestamp}:${rawBody}`, INTERNAL_SECRET))
 *
 * Apply this guard at the controller level on any `@Controller('internal/...')`
 * controller, or register it globally for the `/internal` prefix only.
 */
@Injectable()
export class InternalSignatureGuard implements CanActivate {
  private readonly logger = new Logger(InternalSignatureGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const timestamp = request.headers['x-timestamp'] as string | undefined;
    const signature = request.headers['x-internal-signature'] as
      | string
      | undefined;

    if (!timestamp || !signature) {
      this.logger.warn(
        `InternalSignatureGuard: missing header(s) on ${request.method} ${request.path}`,
      );
      throw new UnauthorizedException('Missing internal signature headers');
    }

    // Reject stale requests
    const requestTime = parseInt(timestamp, 10);
    if (isNaN(requestTime) || Date.now() - requestTime > MAX_TIMESTAMP_AGE_MS) {
      this.logger.warn(
        `InternalSignatureGuard: stale timestamp ${timestamp} on ${request.path}`,
      );
      throw new UnauthorizedException('Request timestamp is stale');
    }

    const secret = process.env.INTERNAL_SECRET;
    if (!secret) {
      this.logger.error(
        'InternalSignatureGuard: INTERNAL_SECRET env var is not set',
      );
      throw new UnauthorizedException('Internal signing is misconfigured');
    }

    // Raw body is expected to have been captured by a body parser as a Buffer
    // on `request.rawBody`. Fall back to empty string for GET / DELETE requests.
    const rawBody =
      (request as unknown as { rawBody?: Buffer }).rawBody?.toString('utf8') ??
      '';

    const expected = createHmac('sha256', secret)
      .update(`${timestamp}:${rawBody}`)
      .digest('hex');

    if (!timingSafeEqual(expected, signature)) {
      this.logger.warn(
        `InternalSignatureGuard: invalid signature on ${request.method} ${request.path}`,
      );
      throw new UnauthorizedException('Invalid internal signature');
    }

    return true;
  }
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return (
    bufA.length === bufB.length &&
    require('crypto').timingSafeEqual(bufA, bufB)
  );
}
