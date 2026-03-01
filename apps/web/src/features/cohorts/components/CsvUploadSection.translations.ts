import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    uploadCsvTitle: 'Import via CSV',
    uploadCsvDescription: 'Upload a CSV file with a "user_id" column to bulk-import members',
    uploadCsvButton: 'Choose CSV file',
    uploadCsvSuccess: 'CSV imported successfully',
    uploadCsvFailed: 'Failed to import CSV',
    uploadCsvInvalidFormat: 'Invalid file format — only .csv files are accepted',
  },
  ru: {
    uploadCsvTitle: 'Импорт через CSV',
    uploadCsvDescription: 'Загрузите CSV-файл со столбцом "user_id" для массового импорта участников',
    uploadCsvButton: 'Выбрать CSV-файл',
    uploadCsvSuccess: 'CSV импортирован успешно',
    uploadCsvFailed: 'Не удалось импортировать CSV',
    uploadCsvInvalidFormat: 'Неверный формат файла — принимаются только файлы .csv',
  },
});
