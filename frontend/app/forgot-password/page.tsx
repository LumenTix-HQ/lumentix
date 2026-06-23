'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/contexts/ToastContext';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

const forgotPasswordSchema = z.object({
  email: z.string().email('Enter a valid email address'),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (values: ForgotPasswordFormValues) => {
    setServerError(null);

    try {
      const response = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: values.email }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Don't reveal whether email exists - show generic message
        setServerError(data?.message ?? 'An error occurred. Please try again.');
        return;
      }

      // Success - show confirmation but don't reveal if email exists
      setIsSubmitted(true);
      toast.success('If an account exists with this email, you will receive password reset instructions.');
      reset();
    } catch {
      setServerError('Network error. Please check your connection and try again.');
    }
  };

  return (
    <main className="min-h-screen bg-[#060609] text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
            Forgot Password
          </h1>
          <p className="text-gray-500 mt-2 text-sm">
            Enter your email address and we'll send you instructions to reset your password
          </p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
          {isSubmitted ? (
            // Success State
            <div className="text-center space-y-6">
              <div className="mx-auto w-16 h-16 bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-white">Check Your Email</h2>
                <p className="text-gray-400 text-sm">
                  If an account exists with the email you provided, you'll receive a password reset link shortly.
                </p>
                <p className="text-gray-500 text-xs">
                  Didn't receive an email? Check your spam folder or try again.
                </p>
              </div>
              <div className="space-y-3 pt-4">
                <button
                  onClick={() => setIsSubmitted(false)}
                  className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-500 transition-colors"
                >
                  Try Another Email
                </button>
                <Link
                  href="/login"
                  className="block w-full bg-white/5 border border-white/10 text-white py-3 rounded-xl font-semibold hover:bg-white/10 transition-colors text-center"
                >
                  Back to Login
                </Link>
              </div>
            </div>
          ) : (
            // Form State
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
              {serverError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm">
                  {serverError}
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1.5">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  {...register('email')}
                  className={`w-full bg-white/5 border rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                    errors.email ? 'border-red-500/50' : 'border-white/10'
                  }`}
                  placeholder="you@example.com"
                />
                {errors.email && (
                  <p className="mt-1.5 text-sm text-red-400">{errors.email.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <svg
                      className="animate-spin h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"
                      />
                    </svg>
                    Sending...
                  </>
                ) : (
                  'Send Reset Link'
                )}
              </button>

              <p className="text-center text-sm text-gray-500">
                Remember your password?{' '}
                <Link href="/login" className="text-blue-400 hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
