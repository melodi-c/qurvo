import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    title: 'Dashboards',
    newDashboard: 'New Dashboard',
    selectProject: 'Select a project to view dashboards',
    placeholder: 'Dashboard name',
    creating: 'Creating...',
    noYet: 'No dashboards yet',
    createToStart: 'Create a dashboard to get started',
    deleted: 'Dashboard deleted',
    deleteFailed: 'Failed to delete dashboard',
    deleteTitle: 'Delete "{{name}}"?',
    deleteDescription: 'This dashboard and all its widgets will be permanently removed.',
    delete: 'Delete',
  },
  ru: {
    title: 'Дашборды',
    newDashboard: 'Новый дашборд',
    selectProject: 'Выберите проект для просмотра дашбордов',
    placeholder: 'Название дашборда',
    creating: 'Создание...',
    noYet: 'Дашбордов пока нет',
    createToStart: 'Создайте дашборд, чтобы начать',
    deleted: 'Дашборд удалён',
    deleteFailed: 'Не удалось удалить дашборд',
    deleteTitle: 'Удалить "{{name}}"?',
    deleteDescription: 'Этот дашборд и все его виджеты будут удалены безвозвратно.',
    delete: 'Удалить',
  },
});
