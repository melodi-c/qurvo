import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    formulas: 'Formulas',
    addFormula: 'Add formula',
    formulaLabel: 'Label',
    formulaExpression: 'Expression',
    formulaPlaceholder: 'e.g. B / A * 100',
    labelPlaceholder: 'e.g. Conversion Rate',
    errorEmpty: 'Expression is empty',
    errorSyntax: 'Invalid expression syntax',
    errorUnknownSeries: 'Unknown series letter',
    errorNoSeries: 'Expression must reference at least one series',
  },
  ru: {
    formulas: 'Формулы',
    addFormula: 'Добавить формулу',
    formulaLabel: 'Название',
    formulaExpression: 'Выражение',
    formulaPlaceholder: 'напр. B / A * 100',
    labelPlaceholder: 'напр. Конверсия',
    errorEmpty: 'Выражение пустое',
    errorSyntax: 'Некорректный синтаксис выражения',
    errorUnknownSeries: 'Неизвестная буква серии',
    errorNoSeries: 'Выражение должно ссылаться хотя бы на одну серию',
  },
});
