import { create } from 'zustand';
import { api } from '../api/client';

interface AppUser {
  id?: string;
  email: string;
  display_name: string;
}

interface AuthState {
  user: AppUser | null;
  loading: boolean;
  setUser: (user: AppUser | null) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; display_name: string }) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,

  setUser: (user) => set({ user }),

  login: async (email, password) => {
    const res = await api.authControllerLogin({ email, password });
    localStorage.setItem('qurvo_token', res.token);
    set({ user: res.user });
  },

  register: async (data) => {
    const res = await api.authControllerRegister(data);
    localStorage.setItem('qurvo_token', res.token);
    set({ user: res.user });
  },

  logout: async () => {
    try { await api.authControllerLogout(); } catch {}
    localStorage.removeItem('qurvo_token');
    set({ user: null });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('qurvo_token');
    if (!token) {
      set({ user: null, loading: false });
      return;
    }
    try {
      const res = await api.authControllerMe();
      set({ user: res.user, loading: false });
    } catch {
      localStorage.removeItem('qurvo_token');
      set({ user: null, loading: false });
    }
  },
}));
