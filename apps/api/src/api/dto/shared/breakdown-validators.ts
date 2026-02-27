import { registerDecorator, type ValidationOptions, type ValidationArguments } from 'class-validator';

/**
 * Class-level decorator that enforces mutual exclusion between
 * `breakdown_cohort_ids` and `breakdown_property`.
 * Passing both simultaneously is ambiguous and returns HTTP 400.
 */
export function BreakdownMutuallyExclusive(validationOptions?: ValidationOptions) {
  return function (target: object) {
    registerDecorator({
      name: 'breakdownMutuallyExclusive',
      target: target as new (...args: unknown[]) => unknown,
      propertyName: 'breakdown_cohort_ids',
      options: {
        message: 'укажите только один тип breakdown: breakdown_cohort_ids или breakdown_property, но не оба одновременно',
        ...validationOptions,
      },
      validator: {
        validate(_value: unknown, args: ValidationArguments) {
          const obj = args.object as Record<string, unknown>;
          const hasCohortIds =
            Array.isArray(obj['breakdown_cohort_ids']) &&
            (obj['breakdown_cohort_ids'] as unknown[]).length > 0;
          const hasProperty =
            typeof obj['breakdown_property'] === 'string' &&
            obj['breakdown_property'].length > 0;
          // Valid when at most one is provided
          return !(hasCohortIds && hasProperty);
        },
      },
    });
  };
}

/**
 * Class-level decorator that requires `breakdown_type='cohort'` when
 * `breakdown_cohort_ids` is provided. Passing cohort IDs without the
 * matching breakdown_type silently ignores them, so we reject early.
 */
export function BreakdownCohortIdsRequiresCohortType(validationOptions?: ValidationOptions) {
  return function (target: object) {
    registerDecorator({
      name: 'breakdownCohortIdsRequiresCohortType',
      target: target as new (...args: unknown[]) => unknown,
      propertyName: 'breakdown_cohort_ids',
      options: {
        message: "при передаче breakdown_cohort_ids поле breakdown_type должно быть равно 'cohort'",
        ...validationOptions,
      },
      validator: {
        validate(_value: unknown, args: ValidationArguments) {
          const obj = args.object as Record<string, unknown>;
          const hasCohortIds =
            Array.isArray(obj['breakdown_cohort_ids']) &&
            (obj['breakdown_cohort_ids'] as unknown[]).length > 0;
          if (!hasCohortIds) return true;
          return obj['breakdown_type'] === 'cohort';
        },
      },
    });
  };
}
