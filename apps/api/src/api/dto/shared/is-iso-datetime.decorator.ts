import type { ValidationOptions } from 'class-validator';
import { registerDecorator } from 'class-validator';

const ISO_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;

export function IsIsoDatetime(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isIsoDatetime',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a valid ISO 8601 datetime (e.g. YYYY-MM-DDTHH:mm:ss, YYYY-MM-DDTHH:mm:ss.sssZ, YYYY-MM-DDTHH:mm:ss+HH:mm)`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && ISO_DATETIME_REGEX.test(value);
        },
      },
    });
  };
}
