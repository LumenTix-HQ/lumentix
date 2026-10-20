'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterFormValues } from '@/lib/schemas/auth.schema';

// Requests go through the same-origin proxy so the API base is configured in one place.
const REGISTER_URL = '/api/proxy/auth/register';

const inputClass = (hasError: boolean) =>
  `w-full bg-white/5 border rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
    hasError ? 'border-red-500/50' : 'border-white/10'
  }`;

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
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', displayName: '', password: '', confirmPassword: '' },
  });

  const password = watch('password');
  const strength = getStrength(password ?? '');

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const res = await fetch(REGISTER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: values.email,
          password: values.password,
          displayName: values.displayName || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg: string = Array.isArray(body.message) ? body.message[0] : (body.message ?? '');
        if (res.status === 409) {
          if (msg.toLowerCase().includes('email')) {
            setError('email', { message: 'This email address is already taken' });
          } else {
            setServerError(msg || 'Registration failed');
          }
        } else if (res.status === 400) {
          setServerError(msg || 'Invalid registration data');
        } else {
          setServerError(msg || 'Something went wrong. Please try again.');
        }
        return;
      }

      router.push('/login?registered=1');
    } catch {
      setServerError('Something went wrong. Please try again.');
    }
  });

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

          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">Email</label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
                className={inputClass(!!errors.email)}
                {...register('email')}
              />
              {errors.email && (
                <p id="email-error" className="text-red-400 text-xs mt-1">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-gray-300 mb-1">Display name (optional)</label>
              <input
                id="displayName"
                type="text"
                placeholder="Your name"
                aria-invalid={!!errors.displayName}
                aria-describedby={errors.displayName ? 'displayName-error' : undefined}
                className={inputClass(!!errors.displayName)}
                {...register('displayName')}
              />
              {errors.displayName && (
                <p id="displayName-error" className="text-red-400 text-xs mt-1">{errors.displayName.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">Password</label>
              <input
                id="password"
                type="password"
                placeholder="Min 8 characters, at least 1 number"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'password-error' : undefined}
                className={inputClass(!!errors.password)}
                {...register('password')}
              />
              {password && (
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
              {errors.password && (
                <p id="password-error" className="text-red-400 text-xs mt-1">{errors.password.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-1">Confirm password</label>
              <input
                id="confirmPassword"
                type="password"
                aria-invalid={!!errors.confirmPassword}
                aria-describedby={errors.confirmPassword ? 'confirmPassword-error' : undefined}
                className={inputClass(!!errors.confirmPassword)}
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && (
                <p id="confirmPassword-error" className="text-red-400 text-xs mt-1">{errors.confirmPassword.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-2"
            >
              {isSubmitting ? 'Creating account…' : 'Create account'}
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
