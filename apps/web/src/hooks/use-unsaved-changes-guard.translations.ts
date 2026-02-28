import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    title: 'Unsaved changes',
    description: 'You have unsaved changes. Are you sure you want to leave? Your changes will be lost.',
    confirm: 'Leave',
    cancel: 'Stay',
  },
  ru: {
    title: 'Несохраненные изменения',
    description: 'У вас есть несохраненные изменения. Вы уверены, что хотите уйти? Изменения будут потеряны.',
    confirm: 'Уйти',
    cancel: 'Остаться',
  },
});
