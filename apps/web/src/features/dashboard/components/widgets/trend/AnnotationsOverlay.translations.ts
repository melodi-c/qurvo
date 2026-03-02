import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    annotationsForDate: 'Annotations for {{date}}',
    edit: 'Edit',
    delete: 'Delete',
    addAnnotation: '+ Add annotation',
    deleteTitle: 'Delete annotation',
    deleteDescription: 'Are you sure you want to delete "{{label}}"?',
  },
  ru: {
    annotationsForDate: 'Аннотации за {{date}}',
    edit: 'Редактировать',
    delete: 'Удалить',
    addAnnotation: '+ Добавить аннотацию',
    deleteTitle: 'Удалить аннотацию',
    deleteDescription: 'Вы уверены, что хотите удалить "{{label}}"?',
  },
});
