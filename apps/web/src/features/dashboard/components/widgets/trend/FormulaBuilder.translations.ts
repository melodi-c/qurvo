import { createTranslations } from '@/i18n/types';

export default createTranslations({
  en: {
    formulas: 'Formulas',
    addFormula: 'Add formula',
    formulaPlaceholder: 'e.g. B / A * 100',
    labelPlaceholder: 'e.g. Conversion Rate',
    expression: 'Expression',
    expressionTooltip: 'Variables A, B, C correspond to series in order. Supported operations: +, -, *, /, and parentheses.\n\nExamples:\n(A / B) * 100 — conversion of series A to B in percent\nA - B — difference between two metrics\nA / (A + B) — share of the total',
    errorEmpty: 'Expression is empty',
    errorSyntax: 'Invalid expression syntax',
    errorUnknownSeries: 'Unknown series letter',
    errorNoSeries: 'Expression must reference at least one series',
  },
  ru: {
    formulas: 'Формулы',
    addFormula: 'Добавить формулу',
    formulaPlaceholder: 'напр. B / A * 100',
    labelPlaceholder: 'напр. Конверсия',
    expression: 'Выражение',
    expressionTooltip: 'Переменные A, B, C соответствуют сериям по порядку. Поддерживаются операции: +, -, *, /, скобки.\n\nПримеры:\n(A / B) * 100 — конверсия серии A к серии B в процентах\nA - B — разница между двумя метриками\nA / (A + B) — доля от суммы',
    errorEmpty: 'Выражение пустое',
    errorSyntax: 'Некорректный синтаксис выражения',
    errorUnknownSeries: 'Неизвестная буква серии',
    errorNoSeries: 'Выражение должно ссылаться хотя бы на одну серию',
  },
});
