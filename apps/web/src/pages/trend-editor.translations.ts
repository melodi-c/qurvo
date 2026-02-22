import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    backLabel: 'Insights',
    placeholder: 'Untitled trend',
    defaultName: 'Untitled trend',
    configureTitle: 'Configure your trend',
    configureDescription: 'Add at least 1 series with an event name to see results',
    noResultsTitle: 'No results found',
    noResultsDescription: 'No events match these series in the selected date range',
    series: 'Series',
    previousPeriod: 'Previous period',
  },
  ru: {
    backLabel: 'Инсайты',
    placeholder: 'Новый тренд',
    defaultName: 'Новый тренд',
    configureTitle: 'Настройте тренд',
    configureDescription: 'Добавьте хотя бы 1 серию с названием события, чтобы увидеть результаты',
    noResultsTitle: 'Результатов не найдено',
    noResultsDescription: 'Нет событий, соответствующих этим сериям за выбранный период',
    series: 'Серии',
    previousPeriod: 'Предыдущий период',
  },
});
