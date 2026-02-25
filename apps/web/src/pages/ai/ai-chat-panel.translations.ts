import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    askTitle: 'Ask about your data',
    askHint: 'Try: "How many signups last week?" or "Show me a retention chart"',
    inputPlaceholder: 'Ask about your analytics data...',
    stopStreaming: 'Stop',
    sendMessage: 'Send',
  },
  ru: {
    askTitle: 'Спросите о ваших данных',
    askHint: 'Попробуйте: "Сколько регистраций на прошлой неделе?" или "Покажи график удержания"',
    inputPlaceholder: 'Спросите о вашей аналитике...',
    stopStreaming: 'Остановить',
    sendMessage: 'Отправить',
  },
});
