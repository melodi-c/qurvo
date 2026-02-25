import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    title: 'Overview',
    totalUsers: 'Total Users',
    totalProjects: 'Total Projects',
    totalEvents: 'Total Events',
    redisQueueDepth: 'Redis Queue Depth',
    errorLoading: 'Failed to load stats',
    retry: 'Retry',
  },
  ru: {
    title: 'Обзор',
    totalUsers: 'Всего пользователей',
    totalProjects: 'Всего проектов',
    totalEvents: 'Всего событий',
    redisQueueDepth: 'Глубина очереди Redis',
    errorLoading: 'Не удалось загрузить статистику',
    retry: 'Повторить',
  },
});
