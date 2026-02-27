import { registerDecorator, ValidationOptions } from 'class-validator';

export function IsValidRegex(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidRegex',
      target: object.constructor,
      propertyName,
      options: {
        message: 'Must be a valid regular expression',
        ...validationOptions,
      },
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;
          try {
            new RegExp(value);
            return true;
          } catch {
            return false;
          }
        },
      },
    });
  };
}
