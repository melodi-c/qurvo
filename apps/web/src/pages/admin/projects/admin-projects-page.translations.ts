import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    title: 'Projects',
    name: 'Name',
    slug: 'Slug',
    plan: 'Plan',
    memberCount: 'Members',
    createdAt: 'Created',
    noPlan: 'No plan',
    noProjects: 'No projects found',
    noProjectsDescription: 'There are no projects in the system yet.',
  },
  ru: {
    title: 'Проекты',
    name: 'Название',
    slug: 'Slug',
    plan: 'План',
    memberCount: 'Участники',
    createdAt: 'Создан',
    noPlan: 'Без плана',
    noProjects: 'Проекты не найдены',
    noProjectsDescription: 'В системе пока нет ни одного проекта.',
  },
});
