import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    backLabel: 'Insights',
    placeholder: 'Untitled lifecycle',
    defaultName: 'Untitled lifecycle',
    configureTitle: 'Configure your lifecycle',
    configureDescription: 'Select a target event to see lifecycle data',
    noResultsTitle: 'No results found',
    noResultsDescription: 'No events match in the selected date range',
    new: 'New',
    returning: 'Returning',
    resurrecting: 'Resurrecting',
    dormant: 'Dormant',
    descriptionPlaceholder: 'Add description...',
  },
  ru: {
    backLabel: 'Инсайты',
    placeholder: 'Новый lifecycle',
    defaultName: 'Новый lifecycle',
    configureTitle: 'Настройте lifecycle',
    configureDescription: 'Выберите целевое событие, чтобы увидеть данные жизненного цикла',
    noResultsTitle: 'Результатов не найдено',
    noResultsDescription: 'Нет событий за выбранный период',
    new: 'Новые',
    returning: 'Вернувшиеся',
    resurrecting: 'Воскресшие',
    dormant: 'Неактивные',
    descriptionPlaceholder: 'Добавьте описание...',
  },
});
