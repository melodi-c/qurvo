import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    cohort: 'Cohort',
    users: 'Users',
    average: 'Average',
    day: 'Day',
    week: 'Week',
    month: 'Month',
    usersCount: '{{count}} users ({{pct}}%)',
  },
  ru: {
    cohort: 'Когорта',
    users: 'Пользователи',
    average: 'Среднее',
    day: 'День',
    week: 'Неделя',
    month: 'Месяц',
    usersCount: '{{count}} пользователей ({{pct}}%)',
  },
});
