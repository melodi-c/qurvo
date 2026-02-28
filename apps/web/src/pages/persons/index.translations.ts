import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    title: 'Persons',
    total: '{{count}} total',
    selectProject: 'Select a project to view persons',
    noPersons: 'No persons found',
    errorLoading: 'Failed to load persons',
    retry: 'Retry',
    identifier: 'Identifier',
    name: 'Name',
    email: 'Email',
    firstSeen: 'First Seen',
    lastSeen: 'Last Seen',
  },
  ru: {
    title: 'Пользователи',
    total: '{{count}} всего',
    selectProject: 'Выберите проект для просмотра пользователей',
    noPersons: 'Пользователи не найдены',
    errorLoading: 'Не удалось загрузить пользователей',
    retry: 'Повторить',
    identifier: 'Идентификатор',
    name: 'Имя',
    email: 'Email',
    firstSeen: 'Первое посещение',
    lastSeen: 'Последнее посещение',
  },
});
