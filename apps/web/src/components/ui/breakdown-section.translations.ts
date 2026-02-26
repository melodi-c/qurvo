import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    breakdown: 'Breakdown',
    property: 'Property',
    cohort: 'Cohort',
    propertyPlaceholder: 'e.g. country, plan, properties.utm_source',
    propertyDescription: 'Split results by a user or event property',
    cohortDescription: 'Compare results across selected cohorts',
    presetGroupLabel: 'Device & Geo',
    presetCountry: 'Country',
    presetRegion: 'Region',
    presetCity: 'City',
    presetBrowser: 'Browser',
    presetOs: 'OS',
    presetDeviceType: 'Device type',
  },
  ru: {
    breakdown: 'Разбивка',
    property: 'Свойство',
    cohort: 'Когорта',
    propertyPlaceholder: 'напр. country, plan, properties.utm_source',
    propertyDescription: 'Разбить результаты по свойству пользователя или события',
    cohortDescription: 'Сравнить результаты между выбранными когортами',
    presetGroupLabel: 'Устройство и гео',
    presetCountry: 'Страна',
    presetRegion: 'Регион',
    presetCity: 'Город',
    presetBrowser: 'Браузер',
    presetOs: 'ОС',
    presetDeviceType: 'Тип устройства',
  },
});
