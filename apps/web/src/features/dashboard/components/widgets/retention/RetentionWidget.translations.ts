import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    noInsight: 'No insight linked',
    configureEvent: 'Configure an event to see retention data',
    loadFailed: 'Failed to load retention data',
    retry: 'Retry',
    noData: 'No data found',
    adjustDateRange: 'Try adjusting the date range',
    cohorts: 'cohorts',
    fresh: 'fresh',
    refresh: 'Refresh',
  },
  ru: {
    noInsight: 'Инсайт не привязан',
    configureEvent: 'Настройте событие для просмотра данных удержания',
    loadFailed: 'Не удалось загрузить данные удержания',
    retry: 'Повторить',
    noData: 'Данные не найдены',
    adjustDateRange: 'Попробуйте изменить диапазон дат',
    cohorts: 'когорт',
    fresh: 'актуально',
    refresh: 'Обновить',
  },
});
