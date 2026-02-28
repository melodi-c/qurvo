/** Non-React translation helpers for hooks and utility functions.
 * Uses getLocale() from the language store (works outside React components). */

import { useLanguageStore } from '@/stores/language';
import type { Language } from '@/i18n/types';

function getLang(): Language {
  return useLanguageStore.getState().language;
}

const ERROR_MESSAGES: Record<string, Record<Language, string>> = {
  requestFailed: {
    en: 'Request failed',
    ru: 'Ошибка запроса',
  },
  unknownError: {
    en: 'Unknown error',
    ru: 'Неизвестная ошибка',
  },
  failedToLoadConversation: {
    en: 'Failed to load conversation',
    ru: 'Не удалось загрузить диалог',
  },
  failedToLoadMessages: {
    en: 'Failed to load messages',
    ru: 'Не удалось загрузить сообщения',
  },
  failedToSave: {
    en: 'Failed to save',
    ru: 'Не удалось сохранить',
  },
};

/** Get a translated error message by key. Falls back to the key itself if not found. */
export function getErrorMessage(key: string): string {
  const lang = getLang();
  return ERROR_MESSAGES[key]?.[lang] ?? key;
}

const ROLE_LABELS: Record<string, Record<Language, string>> = {
  owner: { en: 'Owner', ru: 'Владелец' },
  editor: { en: 'Editor', ru: 'Редактор' },
  viewer: { en: 'Viewer', ru: 'Наблюдатель' },
};

/** Translate a role enum value (owner/editor/viewer) to a localized label. */
export function getRoleLabel(role: string): string {
  const lang = getLang();
  return ROLE_LABELS[role]?.[lang] ?? role;
}

const INSIGHT_TYPE_LABELS: Record<string, Record<Language, string>> = {
  trend: { en: 'Trend', ru: 'Тренд' },
  funnel: { en: 'Funnel', ru: 'Воронка' },
  retention: { en: 'Retention', ru: 'Удержание' },
  lifecycle: { en: 'Lifecycle', ru: 'Жизненный цикл' },
  stickiness: { en: 'Stickiness', ru: 'Вовлечённость' },
  paths: { en: 'Paths', ru: 'Пути' },
};

/** Translate an insight type enum value to a localized label. */
export function getInsightTypeLabel(type: string): string {
  const lang = getLang();
  return INSIGHT_TYPE_LABELS[type]?.[lang] ?? type;
}

const GRANULARITY_LABELS: Record<string, Record<Language, string>> = {
  hour: { en: 'hour', ru: 'час' },
  day: { en: 'day', ru: 'день' },
  week: { en: 'week', ru: 'неделя' },
  month: { en: 'month', ru: 'месяц' },
};

/** Translate a granularity enum value to a localized label. */
export function getGranularityLabel(granularity: string): string {
  const lang = getLang();
  return GRANULARITY_LABELS[granularity]?.[lang] ?? granularity;
}
