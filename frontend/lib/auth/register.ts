const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export interface RegisterPayload {
  email: string;
  password: string;
  displayName?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user?: { id: string; email: string; role: string };
}

export async function registerUser(payload: RegisterPayload): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = Array.isArray(body.message) ? body.message[0] : (body.message ?? 'Registration failed');
    const err: any = new Error(message);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

export async function loginUser(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Login failed');
  }

  return res.json();
}
