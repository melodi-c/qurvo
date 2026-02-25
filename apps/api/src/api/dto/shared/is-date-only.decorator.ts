import { registerDecorator, ValidationOptions } from 'class-validator';

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function IsDateOnly(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isDateOnly',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a date in YYYY-MM-DD format`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && DATE_ONLY_REGEX.test(value);
        },
      },
    });
  };
}
