import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    profile: 'Profile',
    personId: 'Person ID',
    identifiers: 'Identifiers',
    firstSeen: 'First seen',
    lastSeen: 'Last seen',
    properties: 'Properties',
    noProperties: 'No user properties recorded.',
    eventHistory: 'Event History',
    errorLoadingPerson: 'Failed to load person details',
    errorLoadingEvents: 'Failed to load event history',
    retry: 'Retry',
  },
  ru: {
    profile: 'Профиль',
    personId: 'ID пользователя',
    identifiers: 'Идентификаторы',
    firstSeen: 'Первое посещение',
    lastSeen: 'Последнее посещение',
    properties: 'Свойства',
    noProperties: 'Свойства пользователя не зафиксированы.',
    eventHistory: 'История событий',
    errorLoadingPerson: 'Не удалось загрузить данные пользователя',
    errorLoadingEvents: 'Не удалось загрузить историю событий',
    retry: 'Повторить',
  },
});
