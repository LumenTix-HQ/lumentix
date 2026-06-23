'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { registerUser, loginUser } from '@/lib/auth/register';

const schema = z
  .object({
    email: z.string().email('Enter a valid email address'),
    displayName: z.string().min(2, 'Display name must be at least 2 characters').or(z.literal('')),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/\d/, 'Password must contain at least one number'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormData = z.infer<typeof schema>;
type FieldErrors = Partial<Record<keyof FormData, string>>;

function getStrength(pw: string): { label: string; width: string; color: string } {
  if (!pw) return { label: '', width: '0%', color: '' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { label: 'Weak', width: '33%', color: 'bg-red-500' };
  if (score <= 3) return { label: 'Medium', width: '66%', color: 'bg-yellow-400' };
  return { label: 'Strong', width: '100%', color: 'bg-green-500' };
}

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormData>({
    email: '',
    displayName: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const strength = getStrength(form.password);

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const validate = (): boolean => {
    const result = schema.safeParse(form);
    if (!result.success) {
      const fe: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof FormData;
        if (!fe[key]) fe[key] = issue.message;
      }
      setErrors(fe);
      return false;
    }
    setErrors({});
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    if (!validate()) return;

    setLoading(true);
    try {
      await registerUser({
        email: form.email,
        password: form.password,
        displayName: form.displayName || undefined,
      });
      const tokens = await loginUser(form.email, form.password);
      if (typeof window !== 'undefined') {
        localStorage.setItem('auth_token', tokens.accessToken);
        if (tokens.refreshToken) localStorage.setItem('refresh_token', tokens.refreshToken);
      }
      router.push('/events');
    } catch (err: any) {
      if (err.status === 409 || err.status === 400) {
        const msg: string = err.message ?? '';
        if (msg.toLowerCase().includes('email')) {
          setErrors((prev) => ({ ...prev, email: 'This email address is already taken' }));
        } else {
          setServerError(msg || 'Registration failed');
        }
      } else {
        setServerError(err.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const field = (name: keyof FormData, label: string, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      <input
        type={type}
        value={form[name] as string}
        onChange={set(name)}
        placeholder={placeholder}
        className={`w-full bg-white/5 border rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
          errors[name] ? 'border-red-500/50' : 'border-white/10'
        }`}
      />
      {errors[name] && <p className="text-red-400 text-xs mt-1">{errors[name]}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#060609] text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-white">Create account</h1>
          <p className="text-gray-500 mt-2 text-sm">Join Lumentix to register for events on Stellar</p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
          {serverError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm mb-5">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {field('email', 'Email', 'email', 'you@example.com')}
            {field('displayName', 'Display name (optional)', 'text', 'Your name')}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={set('password')}
                placeholder="Min 8 characters, at least 1 number"
                className={`w-full bg-white/5 border rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                  errors.password ? 'border-red-500/50' : 'border-white/10'
                }`}
              />
              {form.password && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
                      style={{ width: strength.width }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-12">{strength.label}</span>
                </div>
              )}
              {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password}</p>}
            </div>

            {field('confirmPassword', 'Confirm password', 'password')}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-2"
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-5">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-400 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
