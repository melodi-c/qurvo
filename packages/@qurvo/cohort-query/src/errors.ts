/**
 * Thrown by cohort query builders when a condition has logically invalid
 * field values that passed DTO validation (defence-in-depth guard).
 *
 * This is a plain Error subclass with no NestJS or HTTP dependencies so that
 * `@qurvo/cohort-query` stays a pure TypeScript library.
 *
 * The API layer catches this and re-throws as `AppBadRequestException`
 * (HTTP 400), so callers receive a proper 400 instead of a 500.
 */
export class CohortQueryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CohortQueryValidationError';
  }
}
