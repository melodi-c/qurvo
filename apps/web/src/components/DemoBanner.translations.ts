import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    bannerText: 'This is demo data. Connect the SDK to see your real analytics.',
    connectSdk: 'Connect SDK',
    resetData: 'Reset data',
    resetComingSoon: 'This feature is coming soon.',
    resetSuccess: 'Demo data has been reset.',
    resetFailed: 'Failed to reset demo data.',
    resetConfirmTitle: 'Reset demo data?',
    resetConfirmDescription:
      'This will delete all current demo data and regenerate it from scratch. This action cannot be undone.',
  },
  ru: {
    bannerText: 'Это демо-данные. Подключи SDK чтобы увидеть свою реальную аналитику.',
    connectSdk: 'Подключить SDK',
    resetData: 'Сбросить данные',
    resetComingSoon: 'Функция скоро будет доступна.',
    resetSuccess: 'Демо-данные сброшены.',
    resetFailed: 'Не удалось сбросить демо-данные.',
    resetConfirmTitle: 'Сбросить демо-данные?',
    resetConfirmDescription:
      'Все текущие демо-данные будут удалены и сгенерированы заново. Это действие нельзя отменить.',
  },
});
