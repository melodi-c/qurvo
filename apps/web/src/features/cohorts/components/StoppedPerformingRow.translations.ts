import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    stoppedPerforming: 'Stopped performing',
    selectEvent: 'Select event...',
    didInLast: 'did in last',
    butNotInLast: 'but not in last',
    days: 'days',
    tooltip: 'The user performed the event during the historical window but has not performed it in the more recent window. Use this to find users who have churned or disengaged.',
    windowError: '"But not in last" must be less than "did in last"',
  },
  ru: {
    stoppedPerforming: 'Перестал выполнять',
    selectEvent: 'Выберите событие...',
    didInLast: 'выполнял за',
    butNotInLast: 'но не за последние',
    days: 'дн.',
    tooltip: 'Пользователь выполнял событие в историческом периоде, но не выполнял его в более свежем окне. Используйте это условие для поиска пользователей, которые перестали взаимодействовать с продуктом.',
    windowError: '«Но не за последние» должно быть меньше, чем «выполнял за»',
  },
});
