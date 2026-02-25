import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    backLabel: 'Insights',
    placeholder: 'Untitled paths',
    defaultName: 'Untitled paths',
    configureTitle: 'Configure your paths',
    configureDescription: 'Select a start event to explore user navigation paths',
    noPathsTitle: 'No paths found',
    noPathsDescription: 'No event sequences found in the selected date range. Try adjusting filters.',
    uniqueUsers: 'Unique users',
    topPaths: 'Top paths',
    descriptionPlaceholder: 'Add description...',
  },
  ru: {
    backLabel: 'Инсайты',
    placeholder: 'Новые пути',
    defaultName: 'Новые пути',
    configureTitle: 'Настройте пути',
    configureDescription: 'Выберите начальное событие, чтобы изучить пути навигации пользователей',
    noPathsTitle: 'Пути не найдены',
    noPathsDescription: 'Не найдено последовательностей событий за выбранный период. Попробуйте изменить фильтры.',
    uniqueUsers: 'Уникальные пользователи',
    topPaths: 'Популярные пути',
    descriptionPlaceholder: 'Добавьте описание...',
  },
});
