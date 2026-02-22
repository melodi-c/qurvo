import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    pathSettings: 'Path settings',
    steps: 'Steps (3-10)',
    startEvent: 'Start event (optional)',
    anyEvent: 'Any event',
    endEvent: 'End event (optional)',
    minUsersPerPath: 'Min. users per path',
    exclusions: 'Exclusions',
    addExclusion: 'Add exclusion',
    pathCleaning: 'Path cleaning',
    addRule: 'Add rule',
    wildcardGroups: 'Wildcard groups',
    addGroup: 'Add group',
  },
  ru: {
    pathSettings: 'Настройки путей',
    steps: 'Шаги (3-10)',
    startEvent: 'Начальное событие (необязательно)',
    anyEvent: 'Любое событие',
    endEvent: 'Конечное событие (необязательно)',
    minUsersPerPath: 'Мин. пользователей на путь',
    exclusions: 'Исключения',
    addExclusion: 'Добавить исключение',
    pathCleaning: 'Очистка путей',
    addRule: 'Добавить правило',
    wildcardGroups: 'Группы подстановок',
    addGroup: 'Добавить группу',
  },
});
