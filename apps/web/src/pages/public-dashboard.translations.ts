import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    loading: 'Loading dashboard...',
    notFound: 'Dashboard not found',
    notFoundDescription: 'This share link is invalid or has expired.',
    expired: 'Link expired',
    expiredDescription: 'This share link has expired and is no longer accessible.',
    widgetCount: '{{count}} widgets',
    poweredBy: 'Powered by Qurvo',
    textWidget: 'Text',
    insightWidget: 'Insight',
    noWidgets: 'This dashboard has no widgets yet.',
  },
  ru: {
    loading: 'Загрузка дашборда...',
    notFound: 'Дашборд не найден',
    notFoundDescription: 'Эта ссылка недействительна или истекла.',
    expired: 'Ссылка истекла',
    expiredDescription: 'Срок действия этой ссылки истёк.',
    widgetCount: '{{count}} виджетов',
    poweredBy: 'Работает на Qurvo',
    textWidget: 'Текст',
    insightWidget: 'Инсайт',
    noWidgets: 'На этом дашборде пока нет виджетов.',
  },
});
