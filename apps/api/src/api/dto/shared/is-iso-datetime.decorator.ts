import { registerDecorator, ValidationOptions } from 'class-validator';

const ISO_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

export function IsIsoDatetime(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isIsoDatetime',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a datetime in YYYY-MM-DDTHH:mm:ss format without timezone offset`,
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
