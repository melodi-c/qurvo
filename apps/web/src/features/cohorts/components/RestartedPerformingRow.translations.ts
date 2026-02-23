import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    restartedPerforming: 'Restarted performing',
    selectEvent: 'Select event...',
    historicalWindow: 'did in last',
    gapWindow: 'then paused for',
    recentWindow: 'and resumed in last',
    days: 'days',
  },
  ru: {
    restartedPerforming: 'Возобновил',
    selectEvent: 'Выберите событие...',
    historicalWindow: 'выполнял за',
    gapWindow: 'затем пауза',
    recentWindow: 'и возобновил за',
    days: 'дн.',
  },
});
