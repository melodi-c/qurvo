import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    selectProject: 'Select a project to manage API keys',
    newKey: 'New Key',
    keyCreated: 'API Key created. Copy it now \u2014 it won\u2019t be shown again.',
    dismiss: 'Dismiss',
    placeholder: 'Key name (e.g. production)',
    created: 'Created',
    revoked: 'Revoked',
    revoke: 'Revoke',
  },
  ru: {
    selectProject: 'Выберите проект для управления API ключами',
    newKey: 'Новый ключ',
    keyCreated: 'API ключ создан. Скопируйте его сейчас \u2014 он больше не будет показан.',
    dismiss: 'Закрыть',
    placeholder: 'Название ключа (напр. production)',
    created: 'Создан',
    revoked: 'Отозван',
    revoke: 'Отозвать',
  },
});
