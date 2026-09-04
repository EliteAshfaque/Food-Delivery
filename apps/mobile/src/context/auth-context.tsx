import { createContext, useContext, useEffect, useState } from 'react';
import type { User, UserRole } from '@food-delivery/types';

import { deleteToken, getToken, saveToken } from '../../lib/auth';
import { api } from '../../lib/axios';

interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: UserRole;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setLoading] = useState(true);

  useEffect(() => {
    void checkExistingSession();
  }, []);

  async function checkExistingSession() {
    try {
      const token = await getToken();
      if (!token) return;

      const { data } = await api.get<{ user: User }>('/auth/me');
      setUser(data.user);
    } catch (error) {
      console.log(error);
      await deleteToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function login(email: string, password: string) {
    const { data } = await api.post<{ user: User; token: string }>('/auth/login', {
      email,
      password,
    });
    await saveToken(data.token);
    setUser(data.user);
  }

  async function register(data: RegisterData) {
    const { data: response } = await api.post<{ user: User; token: string }>(
      '/auth/register',
      data,
    );
    await saveToken(response.token);
    setUser(response.user);
  }

  async function logout() {
    await deleteToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
