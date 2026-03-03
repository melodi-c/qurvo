import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    loading: 'Loading dashboard...',
    notFound: 'Dashboard not found',
    notFoundDescription: 'This share link is invalid or has expired.',
    expired: 'Link expired',
    expiredDescription: 'This share link has expired and is no longer accessible.',
    poweredBy: 'Powered by Qurvo',
    textWidget: 'Text',
    noWidgets: 'This dashboard has no widgets yet.',
    noData: 'No data available',
    widgetUnavailable: 'Data unavailable',
  },
  ru: {
    loading: 'Загрузка дашборда...',
    notFound: 'Дашборд не найден',
    notFoundDescription: 'Эта ссылка недействительна или истекла.',
    expired: 'Ссылка истекла',
    expiredDescription: 'Срок действия этой ссылки истёк.',
    poweredBy: 'Работает на Qurvo',
    textWidget: 'Текст',
    noWidgets: 'На этом дашборде пока нет виджетов.',
    noData: 'Нет данных',
    widgetUnavailable: 'Данные недоступны',
  },
});
