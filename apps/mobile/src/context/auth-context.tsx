import { createContext, useContext, useEffect, useState } from 'react';
import type { User, UserRole } from '@food-delivery/types';

import { deleteToken, getToken, saveToken } from '../../lib/auth';
import { api } from '@/lib/axios';

interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: UserRole;
}

type RegisterResult = {
  message?: string;
  requiresApproval: boolean;
};

type AuthResponse = {
  token: string;
  user: User;
};

type RegisterResponse = {
  message?: string;
  requiresApproval?: boolean;
  token?: string;
  user: User;
};

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  googleLogin: (idToken: string) => Promise<void>;
  register: (data: RegisterData) => Promise<RegisterResult>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function restoreExistingSession() {
      try {
        const token = await getToken();
        if (!token) return;

        const { data } = await api.get<{ user: User }>('/auth/me');
        if (mounted) setUser(data.user);
      } catch {
        // Do not log the Axios error here: it can include the bearer token in
        // request metadata. An invalid or inactive session is simply cleared.
        try {
          await deleteToken();
        } finally {
          if (mounted) setUser(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void restoreExistingSession();
    return () => {
      mounted = false;
    };
  }, []);

  async function login(email: string, password: string) {
    const { data } = await api.post<AuthResponse>('/auth/login', {
      email: email.trim().toLowerCase(),
      password,
    });
    await establishSession(data);
  }

  async function googleLogin(idToken: string) {
    const { data } = await api.post<AuthResponse>(
      '/auth/google',
      { idToken },
    );
    await establishSession(data);
  }

  async function register(data: RegisterData) {
    const { data: response } = await api.post<RegisterResponse>(
      '/auth/register',
      {
        ...data,
        email: data.email.trim().toLowerCase(),
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
      },
    );

    if (response.requiresApproval) {
      return {
        requiresApproval: true,
        message: response.message,
      };
    }

    if (!response.token) {
      throw new Error('Your account could not be created. Please try again.');
    }

    await establishSession({ user: response.user, token: response.token });
    return { requiresApproval: false };
  }

  async function establishSession({ token, user: authenticatedUser }: AuthResponse) {
    if (!token) throw new Error('Your session could not be started. Please try again.');
    await saveToken(token);
    setUser(authenticatedUser);
  }

  async function logout() {
    try {
      await deleteToken();
    } finally {
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider
      value={{ user, isLoading, login, googleLogin, register, logout }}
    >
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
