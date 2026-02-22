import { useCallback } from 'react';
import { useLanguage } from '@/stores/language';
import type { TranslationsMap } from '@/i18n/types';

type InterpolationValues = Record<string, string | number>;

export function useLocalTranslation<T extends Record<string, string>>(
  translations: TranslationsMap<T>,
) {
  const currentLang = useLanguage();

  const currentTranslations = translations[currentLang] || translations.en;

  const t = useCallback(
    <K extends keyof T>(key: K, params?: InterpolationValues): string => {
      const value = currentTranslations[key];

      if (typeof value !== 'string') {
        console.warn(`Translation value is not a string: ${String(key)}`);
        return String(key);
      }

      if (params) {
        return value.replace(/\{\{(\w+)\}\}/g, (_, paramKey) =>
          String(params[paramKey] ?? `{{${paramKey}}}`),
        );
      }

      return value;
    },
    [currentTranslations],
  );

  return { t, lang: currentLang };
}
