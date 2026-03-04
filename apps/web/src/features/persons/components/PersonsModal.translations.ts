import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    title: 'Persons',
    noPersons: 'No persons found for this data point',
    identifier: 'Identifier',
    name: 'Name',
    email: 'Email',
    saveAsCohort: 'Save as cohort',
    cohortName: 'Cohort name',
    saving: 'Saving...',
    saved: 'Cohort created successfully',
    cancel: 'Cancel',
    saveLimitWarning: 'Only {{count}} persons on this page will be saved',
    saveFailed: 'Failed to create cohort',
  },
  ru: {
    title: 'Персоны',
    noPersons: 'Для этой точки данных персоны не найдены',
    identifier: 'Идентификатор',
    name: 'Имя',
    email: 'Email',
    saveAsCohort: 'Сохранить как когорту',
    cohortName: 'Название когорты',
    saving: 'Сохранение...',
    saved: 'Когорта успешно создана',
    cancel: 'Отмена',
    saveLimitWarning: 'Будут сохранены только {{count}} персон с этой страницы',
    saveFailed: 'Не удалось создать когорту',
  },
});
