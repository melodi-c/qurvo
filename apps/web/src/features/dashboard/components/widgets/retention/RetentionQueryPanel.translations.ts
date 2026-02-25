import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    retentionType: 'Retention type',
    periods: 'Periods',
    firstTime: 'First time',
    recurring: 'Recurring',
    retentionTypeTooltip: 'First time: tracks users from their very first occurrence of the event. Recurring: counts every return regardless of previous occurrences.',
    periodsTooltip: 'Number of time periods to track after the initial event. Each column in the retention table represents one period.',
  },
  ru: {
    retentionType: 'Тип удержания',
    periods: 'Периоды',
    firstTime: 'Первый раз',
    recurring: 'Повторяющийся',
    retentionTypeTooltip: 'Первый раз: отслеживает пользователей с момента первого появления события. Повторяющийся: учитывает каждое возвращение независимо от предыдущих событий.',
    periodsTooltip: 'Количество временных периодов для отслеживания после первого события. Каждый столбец в таблице удержания соответствует одному периоду.',
  },
});
