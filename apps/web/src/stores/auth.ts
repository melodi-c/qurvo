import { create } from 'zustand';
import { api } from '../api/client';
import { useLanguageStore } from './language';

interface AppUser {
  id?: string;
  email: string;
  display_name: string;
  language?: string;
  email_verified: boolean;
}

interface AuthState {
  user: AppUser | null;
  loading: boolean;
  pendingVerification: boolean;
  setUser: (user: AppUser | null) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; display_name: string }) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  verifyByCode: (code: string) => Promise<void>;
  verifyByToken: (token: string) => Promise<void>;
  resendVerification: () => Promise<{ cooldown_seconds: number }>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  pendingVerification: false,

  setUser: (user) => set({ user }),

  login: async (email, password) => {
    const res = await api.authControllerLogin({ email, password });
    localStorage.setItem('qurvo_token', res.token);
    const user = res.user as AppUser;
    if (user.language) useLanguageStore.getState().setLanguage(user.language as 'ru' | 'en');
    set({
      user,
      pendingVerification: !res.user.email_verified,
    });
  },

  register: async (data) => {
    const res = await api.authControllerRegister(data);
    localStorage.setItem('qurvo_token', res.token);
    const user = res.user as AppUser;
    if (user.language) useLanguageStore.getState().setLanguage(user.language as 'ru' | 'en');
    set({
      user,
      pendingVerification: !res.user.email_verified,
    });
  },

  logout: async () => {
    try { await api.authControllerLogout(); } catch {}
    localStorage.removeItem('qurvo_token');
    set({ user: null, pendingVerification: false });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('qurvo_token');
    if (!token) {
      set({ user: null, loading: false, pendingVerification: false });
      return;
    }
    try {
      const res = await api.authControllerMe();
      const user = res.user as unknown as AppUser;
      if (user.language) useLanguageStore.getState().setLanguage(user.language as 'ru' | 'en');
      set({
        user,
        loading: false,
        pendingVerification: !res.user.email_verified,
      });
    } catch {
      localStorage.removeItem('qurvo_token');
      set({ user: null, loading: false, pendingVerification: false });
    }
  },

  verifyByCode: async (code: string) => {
    await api.authControllerVerifyByCode({ code });
    const user = get().user;
    if (user) {
      set({ user: { ...user, email_verified: true }, pendingVerification: false });
    }
  },

  verifyByToken: async (token: string) => {
    await api.authControllerVerifyByToken({ token });
    const user = get().user;
    if (user) {
      set({ user: { ...user, email_verified: true }, pendingVerification: false });
    }
  },

  resendVerification: async () => {
    return api.authControllerResendVerification();
  },
}));
