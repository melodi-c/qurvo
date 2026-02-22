import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    noInsight: 'No insight linked',
    configureEvent: 'Configure an event to see lifecycle data',
    loadFailed: 'Failed to load lifecycle data',
    retry: 'Retry',
    noData: 'No data found',
    adjustDateRange: 'Try adjusting the date range',
    activeUsers: 'active users',
    fresh: 'fresh',
    refresh: 'Refresh',
  },
  ru: {
    noInsight: 'Инсайт не привязан',
    configureEvent: 'Настройте событие для просмотра данных жизненного цикла',
    loadFailed: 'Не удалось загрузить данные жизненного цикла',
    retry: 'Повторить',
    noData: 'Данные не найдены',
    adjustDateRange: 'Попробуйте изменить диапазон дат',
    activeUsers: 'активных пользователей',
    fresh: 'актуально',
    refresh: 'Обновить',
  },
});
