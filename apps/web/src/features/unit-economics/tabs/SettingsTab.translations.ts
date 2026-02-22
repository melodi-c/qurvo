import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    configureTitle: 'Configure Unit Economics',
    configureDescription:
      'Set the purchase event name to start calculating metrics. Other fields have sensible defaults.',
    purchaseEventName: 'Purchase Event Name',
    purchaseEventHint:
      'The event that represents a purchase (e.g. "purchase", "order_completed")',
    selectEvent: 'Select event...',
    revenueProperty: 'Revenue Property',
    revenuePropertyHint:
      'The property key in event properties that contains the revenue amount',
    currency: 'Currency',
    churnWindow: 'Churn Window (days)',
    saving: 'Saving...',
    saveSettings: 'Save Settings',
    settingsSaved: 'Settings saved',
  },
  ru: {
    configureTitle: 'Настройка юнит-экономики',
    configureDescription:
      'Укажите название события покупки для расчёта метрик. Остальные поля имеют значения по умолчанию.',
    purchaseEventName: 'Событие покупки',
    purchaseEventHint:
      'Событие, которое означает покупку (например, "purchase", "order_completed")',
    selectEvent: 'Выберите событие...',
    revenueProperty: 'Свойство выручки',
    revenuePropertyHint:
      'Ключ свойства события, содержащий сумму выручки',
    currency: 'Валюта',
    churnWindow: 'Окно оттока (дни)',
    saving: 'Сохранение...',
    saveSettings: 'Сохранить настройки',
    settingsSaved: 'Настройки сохранены',
  },
});
