import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/api/client';
import type { Language } from '@/i18n/types';

export const languages: Record<Language, string> = {
  ru: 'Русский',
  en: 'English',
};

interface LanguageState {
  language: Language;
  setLanguage: (language: Language) => void;
  changeLanguage: (language: Language) => void;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: 'ru',

      setLanguage: (language) => set({ language }),

      changeLanguage: (language) => {
        set({ language });
        void api.authControllerUpdateProfile({ language }).catch(() => {});
      },
    }),
    {
      name: 'qurvo-language',
      partialize: (state) => ({ language: state.language }),
    },
  ),
);

export const useLanguage = () => useLanguageStore((s) => s.language);
