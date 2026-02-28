import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    selectProject: 'Select a project first',
    loading: 'Loading dashboard...',
    notFound: 'Dashboard not found',
    notFoundDescription: 'This dashboard does not exist or has been deleted.',
    backToDashboards: 'Back to dashboards',
    addWidget: 'Add Widget',
    cancel: 'Cancel',
    edit: 'Edit',
    saveFailed: 'Failed to save dashboard',
  },
  ru: {
    selectProject: 'Сначала выберите проект',
    loading: 'Загрузка дашборда...',
    notFound: 'Дашборд не найден',
    notFoundDescription: 'Этот дашборд не существует или был удалён.',
    backToDashboards: 'Назад к дашбордам',
    addWidget: 'Добавить виджет',
    cancel: 'Отмена',
    edit: 'Редактировать',
    saveFailed: 'Не удалось сохранить дашборд',
  },
});
