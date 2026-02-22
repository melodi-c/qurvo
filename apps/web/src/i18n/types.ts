export type Language = 'en' | 'ru';

export type TranslationsMap<T> = {
  en: T;
  ru: T;
};

export function createTranslations<T extends Record<string, string>>(
  translations: TranslationsMap<T>,
): TranslationsMap<T> {
  return translations;
}
