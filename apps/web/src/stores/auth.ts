import { create } from 'zustand';
import { api } from '../api/client';
import { useLanguageStore } from './language';
import type { User as GeneratedUser, SessionUser } from '../api/generated/Api';
import type { Language } from '@/i18n/types';

export type User = GeneratedUser & { is_staff?: boolean };

function isLanguage(v: string): v is Language {
  return v === 'ru' || v === 'en';
}

function syncLanguage(lang: string) {
  if (isLanguage(lang)) {useLanguageStore.getState().setLanguage(lang);}
}

interface AuthState {
  user: User | null;
  loading: boolean;
  pendingVerification: boolean;
  setUser: (user: User | null) => void;
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
    syncLanguage(res.user.language);
    set({
      user: res.user,
      pendingVerification: !res.user.email_verified,
    });
  },

  register: async (data) => {
    const res = await api.authControllerRegister(data);
    localStorage.setItem('qurvo_token', res.token);
    syncLanguage(res.user.language);
    set({
      user: res.user,
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
      const s = res.user;
      const user: User = {
        id: s.user_id,
        email: s.email,
        display_name: s.display_name,
        language: s.language,
        email_verified: s.email_verified,
        is_staff: (s as SessionUser & { is_staff?: boolean }).is_staff,
      };
      syncLanguage(user.language);
      set({
        user,
        loading: false,
        pendingVerification: !user.email_verified,
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
