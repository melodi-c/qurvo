import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    noInsight: 'No insight linked',
    configureSeries: 'Configure series to see trend data',
    configure: 'Configure',
    loadFailed: 'Failed to load trend data',
    retry: 'Retry',
    noEvents: 'No events found',
    adjustRange: 'Try adjusting the date range or series',
    fresh: 'fresh',
    refresh: 'Refresh',
    seriesLabel: 'Series 1',
  },
  ru: {
    noInsight: 'Инсайт не привязан',
    configureSeries: 'Настройте серии для просмотра данных трендов',
    configure: 'Настроить',
    loadFailed: 'Не удалось загрузить данные трендов',
    retry: 'Повторить',
    noEvents: 'События не найдены',
    adjustRange: 'Попробуйте изменить диапазон дат или серии',
    fresh: 'актуально',
    refresh: 'Обновить',
    seriesLabel: 'Серия 1',
  },
});
