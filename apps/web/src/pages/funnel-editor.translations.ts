import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    backLabel: 'Insights',
    placeholder: 'Untitled funnel',
    defaultName: 'Untitled funnel',
    configureTitle: 'Configure your funnel',
    configureDescription: 'Add at least 2 steps with event names to see results',
    noResultsTitle: 'No results found',
    noResultsDescription: 'No events match these steps in the selected date range',
    overallConversion: 'Overall conversion',
    enteredFunnel: 'Entered funnel',
    completed: 'Completed',
    sampled: 'Sampled {{pct}}%',
  },
  ru: {
    backLabel: 'Инсайты',
    placeholder: 'Новая воронка',
    defaultName: 'Новая воронка',
    configureTitle: 'Настройте воронку',
    configureDescription: 'Добавьте хотя бы 2 шага с названиями событий, чтобы увидеть результаты',
    noResultsTitle: 'Результатов не найдено',
    noResultsDescription: 'Нет событий, соответствующих этим шагам за выбранный период',
    overallConversion: 'Общая конверсия',
    enteredFunnel: 'Вошли в воронку',
    completed: 'Завершили',
    sampled: 'Сэмпл {{pct}}%',
  },
});
