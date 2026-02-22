import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    name: 'Name',
    actions: 'Actions',
    selectProject: 'Select a project to view {{title}}',
    deleteTitle: 'Delete {{entity}} "{{name}}"?',
    deleteDescription: 'This action cannot be undone.',
    deleteConfirm: 'Delete',
    deleteSuccess: '{{entity}} deleted',
    deleteError: 'Failed to delete {{entity}}',
  },
  ru: {
    name: 'Название',
    actions: 'Действия',
    selectProject: 'Выберите проект для просмотра: {{title}}',
    deleteTitle: 'Удалить {{entity}} "{{name}}"?',
    deleteDescription: 'Это действие нельзя отменить.',
    deleteConfirm: 'Удалить',
    deleteSuccess: '{{entity}} удалён',
    deleteError: 'Не удалось удалить {{entity}}',
  },
});
