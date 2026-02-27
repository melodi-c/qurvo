import { registerDecorator, ValidationOptions } from 'class-validator';

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isSemanticDateOnly(value: string): boolean {
  if (!DATE_ONLY_REGEX.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  // Append T00:00:00 to force UTC interpretation; bare YYYY-MM-DD is parsed as
  // UTC midnight by the spec but some environments differ — explicit suffix is
  // always safe and avoids timezone-offset surprises.
  const date = new Date(`${value}T00:00:00`);
  if (isNaN(date.getTime())) return false;
  // Guard against date overflow (e.g. 2024-02-30 silently becomes 2024-03-01)
  return (
    date.getFullYear() === year &&
    date.getMonth() + 1 === month &&
    date.getDate() === day
  );
}

export function IsDateOnly(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isDateOnly',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a valid date in YYYY-MM-DD format`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && isSemanticDateOnly(value);
        },
      },
    });
  };
}
