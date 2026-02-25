import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    uniqueVisitors: 'Unique Visitors',
    pageviews: 'Pageviews',
    sessions: 'Sessions',
    avgDuration: 'Avg Duration',
    bounceRate: 'Bounce Rate',
    loadError: 'Failed to load metrics',
  },
  ru: {
    uniqueVisitors: 'Уникальные посетители',
    pageviews: 'Просмотры страниц',
    sessions: 'Сессии',
    avgDuration: 'Средняя длительность',
    bounceRate: 'Показатель отказов',
    loadError: 'Не удалось загрузить метрики',
  },
});
