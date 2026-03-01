import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    removeMembersTitle: 'Browse & Remove',
    removeMembersDescription: 'Search for persons to remove from this cohort',
    removeSelected: 'Remove selected',
    membersRemoved: 'Members removed',
    removeFailed: 'Failed to remove members',
    confirmRemoveTitle: 'Remove members',
    confirmRemoveDescription: 'Are you sure you want to remove the selected persons from this cohort?',
    confirmLabel: 'Remove',
    cancelLabel: 'Cancel',
  },
  ru: {
    removeMembersTitle: 'Просмотр и удаление',
    removeMembersDescription: 'Найдите пользователей для удаления из когорты',
    removeSelected: 'Удалить выбранных',
    membersRemoved: 'Участники удалены',
    removeFailed: 'Не удалось удалить участников',
    confirmRemoveTitle: 'Удалить участников',
    confirmRemoveDescription: 'Вы уверены, что хотите удалить выбранных пользователей из когорты?',
    confirmLabel: 'Удалить',
    cancelLabel: 'Отмена',
  },
});
