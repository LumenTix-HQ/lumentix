import { cookies } from 'next/headers';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

interface RequestOptions {
  params?: Record<string, string>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    try {
      const cookieStore = await cookies();
      const token = cookieStore.get('lumentix_access_token')?.value;
      if (token) {
        return { Authorization: `Bearer ${token}` };
      }
    } catch {}
    return {};
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    const { params, headers: extraHeaders, signal } = options;
    const url = new URL(path, this.baseUrl);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const authHeaders = await this.getAuthHeaders();

    const res = await fetch(url.toString(), {
      method,
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...extraHeaders,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        return this.request<T>(method, path, body, options);
      }
      const cookieStore = await cookies();
      const hasRefresh = cookieStore.get('lumentix_refresh_token')?.value;
      if (!hasRefresh) {
        throw new ApiError(401, 'Session expired');
      }
      throw new ApiError(401, 'Session expired');
    }

    if (!res.ok) {
      const text = await res.text();
      let message = `API error ${res.status}`;
      try {
        const parsed = JSON.parse(text);
        message = Array.isArray(parsed.message) ? parsed.message[0] : (parsed.message ?? message);
      } catch {
        message = text || message;
      }
      throw new ApiError(res.status, message);
    }

    if (res.status === 204) return null as T;
    return res.json();
  }

  private async tryRefresh(): Promise<boolean> {
    try {
      const cookieStore = await cookies();
      const refreshToken = cookieStore.get('lumentix_refresh_token')?.value;
      if (!refreshToken) return false;

      const res = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) return false;
      return true;
    } catch {
      return false;
    }
  }

  async get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, body, options);
  }

  async put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PUT', path, body, options);
  }

  async patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PATCH', path, body, options);
  }

  async delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, undefined, options);
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const apiClient = new ApiClient();
