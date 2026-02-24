import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    contains: 'contains',
    doesNotContain: "doesn't contain",
    isSet: 'is set',
    isNotSet: 'is not set',
    propertyPlaceholder: 'property (e.g. properties.plan)',
    valuePlaceholder: 'value',
  },
  ru: {
    contains: 'содержит',
    doesNotContain: 'не содержит',
    isSet: 'задано',
    isNotSet: 'не задано',
    propertyPlaceholder: 'свойство (напр. properties.plan)',
    valuePlaceholder: 'значение',
  },
});
