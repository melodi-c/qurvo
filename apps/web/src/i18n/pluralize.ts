import type { Language } from './types';

export interface PluralForms {
  one: string;
  few: string;
  many: string;
}

export function pluralize(n: number, forms: PluralForms, language: Language): string {
  const absN = Math.abs(n);

  if (language === 'en') {
    return absN === 1 ? forms.one : forms.many;
  }

  // Russian pluralization
  const mod10 = absN % 10;
  const mod100 = absN % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return forms.one;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return forms.few;
  }

  return forms.many;
}
