import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    noInsight: 'No insight linked',
    configureEvent: 'Configure an event to see stickiness data',
    loadFailed: 'Failed to load stickiness data',
    retry: 'Retry',
    noData: 'No data found',
    adjustDateRange: 'Try adjusting the date range',
    totalUsersOne: 'total user',
    totalUsersFew: 'total users',
    totalUsersMany: 'total users',
    fresh: 'fresh',
    refresh: 'Refresh',
  },
  ru: {
    noInsight: 'Инсайт не привязан',
    configureEvent: 'Настройте событие для просмотра данных вовлечённости',
    loadFailed: 'Не удалось загрузить данные вовлечённости',
    retry: 'Повторить',
    noData: 'Данные не найдены',
    adjustDateRange: 'Попробуйте изменить диапазон дат',
    totalUsersOne: 'пользователь',
    totalUsersFew: 'пользователя',
    totalUsersMany: 'пользователей',
    fresh: 'актуально',
    refresh: 'Обновить',
  },
});
