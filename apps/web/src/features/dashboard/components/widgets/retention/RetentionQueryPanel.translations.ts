import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    retentionType: 'Retention type',
    periods: 'Periods',
    firstTime: 'First time',
    firstTimeDesc: 'Counted from the first event; repeat occurrences in period 0 are ignored',
    recurring: 'Recurring',
    recurringDesc: 'Any occurrence in period 0 serves as the starting point',
    retentionTypeTooltip: 'First time: tracks users from their very first occurrence of the event. Recurring: counts every return regardless of previous occurrences.',
    periodsTooltip: 'Number of time periods to track after the initial event. Each column in the retention table represents one period.',
    returnEvent: 'Return event',
    returnEventTooltip: 'Optional. If set, retention is measured by whether users perform this event instead of the target event. Leave blank to use the target event as the return event.',
    returnEventPlaceholder: 'Same as target event',
  },
  ru: {
    retentionType: 'Тип удержания',
    periods: 'Периоды',
    firstTime: 'Первый раз',
    firstTimeDesc: 'Считается с первого события; повторные в период 0 игнорируются',
    recurring: 'Повторяющийся',
    recurringDesc: 'Любое появление в период 0 является точкой отсчёта',
    retentionTypeTooltip: 'Первый раз: отслеживает пользователей с момента первого появления события. Повторяющийся: учитывает каждое возвращение независимо от предыдущих событий.',
    periodsTooltip: 'Количество временных периодов для отслеживания после первого события. Каждый столбец в таблице удержания соответствует одному периоду.',
    returnEvent: 'Событие возврата',
    returnEventTooltip: 'Необязательно. Если указано, удержание измеряется по факту выполнения этого события вместо целевого. Оставьте пустым, чтобы использовать целевое событие.',
    returnEventPlaceholder: 'Как целевое событие',
  },
});
