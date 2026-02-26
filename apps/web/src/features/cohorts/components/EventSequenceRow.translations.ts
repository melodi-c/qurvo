import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    eventSequence: 'Event sequence',
    notPerformedEventSequence: 'Did not complete sequence',
    selectEvent: 'Select event...',
    thenPerformed: 'then',
    inLast: 'within',
    days: 'days',
    addStep: 'Add step',
    performedTooltip: 'The user performed all listed events in strict order (A, then B, then C) within the specified time window.',
    notPerformedTooltip: 'The user did not complete all listed events in strict order within the specified time window.',
  },
  ru: {
    eventSequence: 'Последовательность',
    notPerformedEventSequence: 'Не выполнил последовательность',
    selectEvent: 'Выберите событие...',
    thenPerformed: 'затем',
    inLast: 'в течение',
    days: 'дн.',
    addStep: 'Добавить шаг',
    performedTooltip: 'Пользователь выполнил все указанные события в строгом порядке (A, затем B, затем C) в рамках заданного временного окна.',
    notPerformedTooltip: 'Пользователь не выполнил все указанные события в строгом порядке в рамках заданного временного окна.',
  },
});
