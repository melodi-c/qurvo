import type { ValidationOptions, ValidationArguments } from 'class-validator';
import { registerDecorator } from 'class-validator';

export function IsLessOrEqualTo(property: string, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isLessOrEqualTo',
      target: (object as { constructor: Function }).constructor,
      propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints as [string];
          const relatedValue = (args.object as Record<string, unknown>)[relatedPropertyName];
          return typeof value === 'number' && typeof relatedValue === 'number' && value <= relatedValue;
        },
        defaultMessage(args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints as [string];
          return `${args.property} must be less than or equal to ${relatedPropertyName}`;
        },
      },
    });
  };
}

export function IsLessThan(property: string, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isLessThan',
      target: (object as { constructor: Function }).constructor,
      propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints as [string];
          const relatedValue = (args.object as Record<string, unknown>)[relatedPropertyName];
          return typeof value === 'number' && typeof relatedValue === 'number' && value < relatedValue;
        },
        defaultMessage(args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints as [string];
          return `${args.property} must be less than ${relatedPropertyName}`;
        },
      },
    });
  };
}

/**
 * Validates that `value` is a non-empty string when the sibling `operator`
 * field is `is_date_before`, `is_date_after`, or `is_date_exact`.
 *
 * An empty or missing value for date operators would cause ClickHouse to throw
 * a parse exception when evaluating `parseDateTimeBestEffort('')`.
 *
 * Applied to the `value` property of DTO classes that carry both `operator`
 * and `value` fields (CohortEventFilterDto, CohortPropertyConditionDto).
 */
export function ValueNotEmptyForDateOperator(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'valueNotEmptyForDateOperator',
      target: (object as { constructor: Function }).constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const obj = args.object as Record<string, unknown>;
          const op = obj['operator'] as string | undefined;
          const DATE_OPS = new Set(['is_date_before', 'is_date_after', 'is_date_exact']);
          if (op && DATE_OPS.has(op)) {
            return typeof value === 'string' && value.length > 0;
          }
          return true;
        },
        defaultMessage() {
          return 'value must be a non-empty string for is_date_before/is_date_after/is_date_exact operators';
        },
      },
    });
  };
}

/**
 * Validates that `values` is a non-empty array when the sibling `operator`
 * field requires a list: `in`, `not_in`, `contains_multi`, `not_contains_multi`.
 *
 * Applied to the `values` property of DTO classes that carry both `operator`
 * and `values` fields (CohortEventFilterDto, CohortPropertyConditionDto).
 */
export function ValuesMinSizeForOperator(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'valuesMinSizeForOperator',
      target: (object as { constructor: Function }).constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const obj = args.object as Record<string, unknown>;
          const op = obj['operator'] as string | undefined;
          const LIST_OPS = new Set(['in', 'not_in', 'contains_multi', 'not_contains_multi']);
          if (op && LIST_OPS.has(op)) {
            return Array.isArray(value) && value.length >= 1;
          }
          return true;
        },
        defaultMessage() {
          return 'values must contain at least 1 element for in/not_in/contains_multi/not_contains_multi operators';
        },
      },
    });
  };
}

/**
 * Validates that when the sibling `operator` field is `between` or `not_between`,
 * `values` has exactly 2 elements and `values[0] <= values[1]` (ordered range).
 *
 * Applied to the `values` property of DTO classes that carry both `operator`
 * and `values` fields (CohortEventFilterDto, CohortPropertyConditionDto).
 */
export function BetweenValuesOrdered(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'betweenValuesOrdered',
      target: (object as { constructor: Function }).constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const obj = args.object as Record<string, unknown>;
          const op = obj['operator'] as string | undefined;
          if (op !== 'between' && op !== 'not_between') {return true;}
          if (!Array.isArray(value) || value.length !== 2) {return false;}
          const min = Number(value[0]);
          const max = Number(value[1]);
          if (isNaN(min) || isNaN(max)) {return false;}
          return min <= max;
        },
        defaultMessage() {
          return 'values[0] must be <= values[1] for between/not_between operators (values must be an ordered numeric range)';
        },
      },
    });
  };
}

export function IsGreaterThanSum(
  prop1: string,
  prop2: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isGreaterThanSum',
      target: (object as { constructor: Function }).constructor,
      propertyName,
      constraints: [prop1, prop2],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [p1, p2] = args.constraints as [string, string];
          const v1 = (args.object as Record<string, unknown>)[p1];
          const v2 = (args.object as Record<string, unknown>)[p2];
          return (
            typeof value === 'number' &&
            typeof v1 === 'number' &&
            typeof v2 === 'number' &&
            value > v1 + v2
          );
        },
        defaultMessage(args: ValidationArguments) {
          const [p1, p2] = args.constraints as [string, string];
          return `${args.property} must be greater than ${p1} + ${p2}`;
        },
      },
    });
  };
}
