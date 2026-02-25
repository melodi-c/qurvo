import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    title: 'Projects',
    newProject: 'New Project',
    placeholder: 'Project name',
    createFirst: 'Create your first project',
    createDescription: 'Projects isolate your analytics data. Each project has its own events, API keys, and dashboards.',
    keys: 'Keys',
    delete: 'Delete',
    deleted: 'Project deleted',
    deleteFailed: 'Failed to delete project',
    deleteTitle: 'Delete "{{name}}"?',
    deleteDescription: 'This action cannot be undone. All project data will be permanently removed, including events, dashboards, insights, API keys, and cohorts.',
  },
  ru: {
    title: 'Проекты',
    newProject: 'Новый проект',
    placeholder: 'Название проекта',
    createFirst: 'Создайте первый проект',
    createDescription: 'Проекты изолируют ваши данные аналитики. У каждого проекта свои события, API ключи и дашборды.',
    keys: 'Ключи',
    delete: 'Удалить',
    deleted: 'Проект удалён',
    deleteFailed: 'Не удалось удалить проект',
    deleteTitle: 'Удалить "{{name}}"?',
    deleteDescription: 'Это действие нельзя отменить. Все данные проекта будут удалены безвозвратно, включая события, дашборды, инсайты, API ключи и когорты.',
  },
});
