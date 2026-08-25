'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

export default function LoginPage() {
  const t = useTranslations('Auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get('redirect') || '/events';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError(t('fillAllFields'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        if (res.status === 401) throw new Error('Invalid email or password credentials');
        throw new Error('Login failed. Please try again.');
      }

      const data = await res.json();
      document.cookie = `access_token=${data.access_token}; path=/`;
      router.push(redirectUrl);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-900 flex items-center justify-center p-4 text-white">
      <div className="bg-gray-800 border border-gray-700 p-8 rounded-2xl max-w-md w-full shadow-2xl space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">{t('loginTitle')}</h1>
          <p className="text-xs text-gray-400">{t('loginSubtitle')}</p>
        </div>

        {error && (
          <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-xs text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">{t('emailAddress')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
              placeholder="user@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">{t('password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs rounded-lg transition"
          >
            {loading ? t('signingIn') : t('signIn')}
          </button>
        </form>

        <div className="flex justify-between text-xs text-gray-400 pt-2 border-t border-gray-700">
          <Link href="/register" className="hover:text-blue-400">{t('createAccount')}</Link>
          <Link href="/forgot-password" className="hover:text-blue-400">{t('forgotPassword')}</Link>
        </div>
      </div>
    </main>
  );
}
