import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    searchPlaceholder: 'Search by name, email or ID...',
    identifier: 'Identifier',
    name: 'Name',
    email: 'Email',
    noPersonsFoundDescription: 'Try a different search term',
    selectPerson: 'Select {{id}}',
  },
  ru: {
    searchPlaceholder: 'Поиск по имени, email или ID...',
    identifier: 'Идентификатор',
    name: 'Имя',
    email: 'Email',
    noPersonsFoundDescription: 'Попробуйте другой поисковый запрос',
    selectPerson: 'Выбрать {{id}}',
  },
});
