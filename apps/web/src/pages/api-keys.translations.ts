import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    title: 'API Keys',
    newKey: 'New Key',
    selectProject: 'Select a project to manage API keys',
    keyCreated: 'API Key created. Copy it now — it won\'t be shown again.',
    dismiss: 'Dismiss',
    placeholder: 'Key name (e.g. production)',
    created: 'Created',
    revoked: 'Revoked',
    revoke: 'Revoke',
  },
  ru: {
    title: 'API ключи',
    newKey: 'Новый ключ',
    selectProject: 'Выберите проект для управления API ключами',
    keyCreated: 'API ключ создан. Скопируйте его сейчас — он больше не будет показан.',
    dismiss: 'Скрыть',
    placeholder: 'Название ключа (напр. production)',
    created: 'Создан',
    revoked: 'Отозван',
    revoke: 'Отозвать',
  },
});
