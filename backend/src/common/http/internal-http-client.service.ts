import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'crypto';

/**
 * A lightweight HTTP client for calls between internal LumenTix services.
 *
 * Every outbound request is automatically signed with:
 *   X-Timestamp            — current Unix epoch in milliseconds (string)
 *   X-Internal-Signature   — hex(HMAC-SHA256(`${timestamp}:${body}`, INTERNAL_SECRET))
 *
 * The receiving service should validate these headers using InternalSignatureGuard.
 */
@Injectable()
export class InternalHttpClientService {
  private readonly logger = new Logger(InternalHttpClientService.name);

  // ─── GET ─────────────────────────────────────────────────────────────────

  async get<T = unknown>(url: string, extraHeaders?: Record<string, string>): Promise<T> {
    const headers = this.buildHeaders('', extraHeaders);

    this.logger.debug(`[internal] GET ${url}`);
    const res = await fetch(url, { method: 'GET', headers });
    return this.handleResponse<T>(res, url);
  }

  // ─── POST ────────────────────────────────────────────────────────────────

  async post<T = unknown>(
    url: string,
    body: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const rawBody = JSON.stringify(body);
    const headers = this.buildHeaders(rawBody, {
      'Content-Type': 'application/json',
      ...extraHeaders,
    });

    this.logger.debug(`[internal] POST ${url}`);
    const res = await fetch(url, { method: 'POST', headers, body: rawBody });
    return this.handleResponse<T>(res, url);
  }

  // ─── PUT ─────────────────────────────────────────────────────────────────

  async put<T = unknown>(
    url: string,
    body: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const rawBody = JSON.stringify(body);
    const headers = this.buildHeaders(rawBody, {
      'Content-Type': 'application/json',
      ...extraHeaders,
    });

    this.logger.debug(`[internal] PUT ${url}`);
    const res = await fetch(url, { method: 'PUT', headers, body: rawBody });
    return this.handleResponse<T>(res, url);
  }

  // ─── DELETE ──────────────────────────────────────────────────────────────

  async delete<T = unknown>(url: string, extraHeaders?: Record<string, string>): Promise<T> {
    const headers = this.buildHeaders('', extraHeaders);

    this.logger.debug(`[internal] DELETE ${url}`);
    const res = await fetch(url, { method: 'DELETE', headers });
    return this.handleResponse<T>(res, url);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private buildHeaders(
    rawBody: string,
    extra?: Record<string, string>,
  ): Record<string, string> {
    const timestamp = String(Date.now());
    const secret = process.env.INTERNAL_SECRET ?? 'change_me_in_production';

    const signature = createHmac('sha256', secret)
      .update(`${timestamp}:${rawBody}`)
      .digest('hex');

    return {
      'X-Timestamp': timestamp,
      'X-Internal-Signature': signature,
      ...extra,
    };
  }

  private async handleResponse<T>(res: Response, url: string): Promise<T> {
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(
        `[internal] ${res.status} ${res.statusText} from ${url}: ${text}`,
      );
      throw new Error(
        `Internal HTTP request to ${url} failed with status ${res.status}`,
      );
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return res.json() as Promise<T>;
    }

    return res.text() as unknown as T;
  }
}
