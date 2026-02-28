import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    title: 'Projects',
    name: 'Name',
    plan: 'Plan',
    memberCount: 'Members',
    createdAt: 'Created',
    noPlan: 'No plan',
    noProjects: 'No projects found',
    noProjectsDescription: 'There are no projects in the system yet.',
    errorLoading: 'Failed to load projects',
    retry: 'Retry',
  },
  ru: {
    title: 'Проекты',
    name: 'Название',
    plan: 'План',
    memberCount: 'Участники',
    createdAt: 'Создан',
    noPlan: 'Без плана',
    noProjects: 'Проекты не найдены',
    noProjectsDescription: 'В системе пока нет ни одного проекта.',
    errorLoading: 'Не удалось загрузить проекты',
    retry: 'Повторить',
  },
});
