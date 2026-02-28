import type { ValidationOptions } from 'class-validator';
import { registerDecorator } from 'class-validator';

const SUPPORTED_TIMEZONES = new Set(Intl.supportedValuesOf('timeZone'));

export function IsIanaTimezone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isIanaTimezone',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a valid IANA timezone (e.g. "Europe/Moscow", "UTC")`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && SUPPORTED_TIMEZONES.has(value);
        },
      },
    });
  };
}
