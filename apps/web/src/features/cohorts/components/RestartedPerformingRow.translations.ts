import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    restartedPerforming: 'Restarted performing',
    selectEvent: 'Select event...',
    historicalWindow: 'did in last',
    gapWindow: 'then paused for',
    recentWindow: 'and resumed in last',
    days: 'days',
    tooltip: 'The user performed the event earlier, then stopped for the gap period, and then resumed performing it in the recent window. Use this to identify re-engaged or reactivated users.',
    windowError: '"Did in last" must be greater than "paused for" + "resumed in last"',
  },
  ru: {
    restartedPerforming: 'Возобновил',
    selectEvent: 'Выберите событие...',
    historicalWindow: 'выполнял за',
    gapWindow: 'затем пауза',
    recentWindow: 'и возобновил за',
    days: 'дн.',
    tooltip: 'Пользователь выполнял событие ранее, затем перестал на период паузы, а затем снова начал выполнять его в недавнем окне. Используйте это условие для поиска вернувшихся пользователей.',
    windowError: '«Выполнял за» должно быть больше суммы «пауза» + «возобновил за»',
  },
});
