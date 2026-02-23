import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    title: 'Data Management',
    selectProject: 'Select a project to view definitions',
    searchPlaceholder: 'Search events...',
    eventCount: '{{count}} event',
    eventCountPlural: '{{count}} events',
    noEventsFound: 'No events found',
    noEventsMatch: 'No events match your search',
    noEventsTracked: 'No events have been tracked yet',
    eventName: 'Event Name',
    lastSeen: 'Last Seen',
    description: 'Description',
    tags: 'Tags',
    noDescription: 'No description',
  },
  ru: {
    title: 'Управление данными',
    selectProject: 'Выберите проект для просмотра определений',
    searchPlaceholder: 'Поиск событий...',
    eventCount: '{{count}} событие',
    eventCountPlural: '{{count}} событий',
    noEventsFound: 'События не найдены',
    noEventsMatch: 'Нет событий, соответствующих поиску',
    noEventsTracked: 'События ещё не зафиксированы',
    eventName: 'Название события',
    lastSeen: 'Последнее событие',
    description: 'Описание',
    tags: 'Теги',
    noDescription: 'Нет описания',
  },
});
