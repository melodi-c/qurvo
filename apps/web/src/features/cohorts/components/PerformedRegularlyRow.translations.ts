import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    performedRegularly: 'Performed regularly',
    selectEvent: 'Select event...',
    atLeastIn: 'at least',
    outOf: 'out of',
    periods: 'periods',
    day: 'Day',
    week: 'Week',
    month: 'Month',
    inLast: 'in last',
    days: 'days',
    tooltip: 'The user regularly performed the event in at least the specified number of periods (days, weeks, or months) out of the total periods within the time window.',
  },
  ru: {
    performedRegularly: 'Регулярное событие',
    selectEvent: 'Выберите событие...',
    atLeastIn: 'минимум в',
    outOf: 'из',
    periods: 'периодов',
    day: 'День',
    week: 'Неделя',
    month: 'Месяц',
    inLast: 'за последние',
    days: 'дн.',
    tooltip: 'Пользователь регулярно выполнял событие как минимум в указанное количество периодов (дней, недель или месяцев) из общего числа периодов в заданном окне.',
  },
});
