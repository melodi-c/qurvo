import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    askTitle: 'Ask about your data',
    askHint: 'Try: "How many signups last week?" or "Show me a retention chart"',
    inputPlaceholder: 'Ask about your analytics data...',
    stopStreaming: 'Stop',
    sendMessage: 'Send',
    examplePrompt0: 'Show me signups trend for the last 30 days',
    examplePrompt1: 'Why did purchases drop this week?',
    examplePrompt2: "What's the conversion from signup to first purchase?",
    examplePrompt3: 'Who are my most active users?',
    examplePrompt4: 'Show me retention for new users',
  },
  ru: {
    askTitle: 'Спросите о ваших данных',
    askHint: 'Попробуйте: "Сколько регистраций на прошлой неделе?" или "Покажи график удержания"',
    inputPlaceholder: 'Спросите о вашей аналитике...',
    stopStreaming: 'Остановить',
    sendMessage: 'Отправить',
    examplePrompt0: 'Покажи тренд регистраций за последние 30 дней',
    examplePrompt1: 'Почему упали покупки на этой неделе?',
    examplePrompt2: 'Конверсия от регистрации до первой покупки',
    examplePrompt3: 'Кто мои самые активные пользователи?',
    examplePrompt4: 'Покажи retention новых пользователей',
  },
});
