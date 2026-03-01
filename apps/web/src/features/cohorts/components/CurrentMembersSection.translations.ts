import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    currentMembersTitle: 'Current Members',
    currentMembersDescription: 'All persons currently in this cohort',
    noMembersDescription: 'This cohort has no members yet',
    loadMembersFailed: 'Failed to load members',
    identifier: 'Identifier',
    name: 'Name',
    email: 'Email',
  },
  ru: {
    currentMembersTitle: 'Текущие участники',
    currentMembersDescription: 'Все пользователи, входящие в эту когорту',
    noMembersDescription: 'В этой когорте пока нет участников',
    loadMembersFailed: 'Не удалось загрузить участников',
    identifier: 'Идентификатор',
    name: 'Имя',
    email: 'Email',
  },
});
