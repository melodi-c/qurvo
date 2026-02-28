import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    title: 'Events',
    selectProject: 'Select a project to explore events',
    errorLoading: 'Failed to load events',
    retry: 'Retry',
    noEvents: 'No events found for the selected filters',
  },
  ru: {
    title: 'События',
    selectProject: 'Выберите проект для просмотра событий',
    errorLoading: 'Не удалось загрузить события',
    retry: 'Повторить',
    noEvents: 'Не найдено событий для выбранных фильтров',
  },
});
