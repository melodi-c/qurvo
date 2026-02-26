import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    inLast: 'in last',
    days: 'days',
    tooltip: 'The condition is applied to events that occurred within the specified number of days prior to the current moment.',
  },
  ru: {
    inLast: 'за последние',
    days: 'дней',
    tooltip: 'Условие применяется к событиям, произошедшим в течение указанного числа дней до текущего момента.',
  },
});
