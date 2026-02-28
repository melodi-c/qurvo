import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    contains: 'contains',
    doesNotContain: "doesn't contain",
    isSet: 'is set',
    isNotSet: 'is not set',
    propertyPlaceholder: 'property (e.g. properties.plan)',
    valuePlaceholder: 'value',
    removeFilter: 'Remove filter',
    isSetHint: 'Property exists in the event — no value required.',
    isNotSetHint: 'Property is absent from the event — no value required.',
  },
  ru: {
    contains: 'содержит',
    doesNotContain: 'не содержит',
    isSet: 'задано',
    isNotSet: 'не задано',
    propertyPlaceholder: 'свойство (напр. properties.plan)',
    valuePlaceholder: 'значение',
    removeFilter: 'Удалить фильтр',
    isSetHint: 'Поле присутствует в свойствах события — значение не требуется.',
    isNotSetHint: 'Поле отсутствует в свойствах события — значение не требуется.',
  },
});
