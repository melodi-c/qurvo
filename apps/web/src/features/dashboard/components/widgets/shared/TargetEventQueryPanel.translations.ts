import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    event: 'Event',
    targetEvent: 'Target event',
    selectEvent: 'Select event...',
    display: 'Display',
    granularity: 'Granularity',
    granularityTooltip: 'X-axis step: group data points by day, week, or month.',
    day: 'Day',
    week: 'Week',
    month: 'Month',
  },
  ru: {
    event: 'Событие',
    targetEvent: 'Целевое событие',
    selectEvent: 'Выберите событие...',
    display: 'Отображение',
    granularity: 'Гранулярность',
    granularityTooltip: 'Шаг оси X: группировка точек данных по дням, неделям или месяцам.',
    day: 'День',
    week: 'Неделя',
    month: 'Месяц',
  },
});
