import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    title: 'Add Insight to Dashboard',
    searchPlaceholder: 'Search insights...',
    noInsightsYet: 'No insights yet. Create a trend or funnel first.',
    noMatch: 'No insights match your search.',
    typeTrend: 'Trend',
    typeFunnel: 'Funnel',
    typeRetention: 'Retention',
    toastAdded: 'Added "{{name}}" to dashboard',
    toastFailed: 'Failed to add widget',
  },
  ru: {
    title: 'Добавить аналитику на дашборд',
    searchPlaceholder: 'Поиск аналитик...',
    noInsightsYet: 'Аналитик пока нет. Сначала создайте тренд или воронку.',
    noMatch: 'Ничего не найдено по вашему запросу.',
    typeTrend: 'Тренд',
    typeFunnel: 'Воронка',
    typeRetention: 'Удержание',
    toastAdded: '«{{name}}» добавлен на дашборд',
    toastFailed: 'Не удалось добавить виджет',
  },
});
