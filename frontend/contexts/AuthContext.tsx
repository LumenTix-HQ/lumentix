'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { getAccessToken, clearTokens } from '@/lib/auth/auth';
import { decodeJwtPayload } from '@/lib/auth/token';

interface User {
  id: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  logout: () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (token) {
      const payload = decodeJwtPayload(token);
      if (payload) {
        setUser({
          id: payload.sub ?? '',
          email: payload.email || 'user@example.com',
          role: payload.role || 'USER',
        });
      } else {
        setUser(null);
      }
    }
  }, []);

  const logout = () => {
    clearTokens();
    setUser(null);
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
