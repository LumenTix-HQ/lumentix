'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { clearTokens } from '@/lib/auth/auth';

interface User {
  id: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  logout: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // Auth now lives in an httpOnly cookie the client can't read directly, so
    // the current user is resolved by asking the backend (via /api/proxy,
    // which forwards the cookie as a bearer token) rather than decoding a
    // token out of localStorage.
    async function loadUser() {
      try {
        const res = await fetch('/api/proxy/auth/me', { credentials: 'include' });
        if (!res.ok) {
          if (!cancelled) setUser(null);
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setUser({ id: data.id, email: data.email, role: data.role });
        }
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadUser();
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = async () => {
    // Await revocation + cookie clearing before navigating: a client-side
    // navigation can abort the in-flight POST, leaving the session (and the
    // refresh token) alive.
    await clearTokens();
    setUser(null);
    router.replace('/');
    router.refresh();
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
