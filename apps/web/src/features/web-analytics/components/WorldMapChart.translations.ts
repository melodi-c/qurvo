import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    noData: 'No geographic data available',
    visitors: 'visitors',
    pageviews: 'pageviews',
    legendMax: 'max',
    loadError: 'Failed to load map data',
  },
  ru: {
    noData: 'Нет данных по географии',
    visitors: 'посетителей',
    pageviews: 'просмотров',
    legendMax: 'макс',
    loadError: 'Не удалось загрузить данные карты',
  },
});
