import type { ValidationOptions } from 'class-validator';
import { registerDecorator } from 'class-validator';

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isSemanticDateOnly(value: string): boolean {
  if (!DATE_ONLY_REGEX.test(value)) {return false;}
  const [year, month, day] = value.split('-').map(Number);
  // Append T00:00:00 to force UTC interpretation; bare YYYY-MM-DD is parsed as
  // UTC midnight by the spec but some environments differ — explicit suffix is
  // always safe and avoids timezone-offset surprises.
  const date = new Date(`${value}T00:00:00`);
  if (isNaN(date.getTime())) {return false;}
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

/**
 * Relative date tokens accepted by analytics queries.
 * - `-Nd`  — N days ago (e.g. `-7d`, `-30d`, `-180d`)
 * - `-Ny`  — N years ago (e.g. `-1y`)
 * - `mStart` — start of current month
 * - `yStart` — start of current year
 */
const RELATIVE_DATE_REGEX = /^-\d+[dy]$/;
const RELATIVE_ANCHORS = new Set(['mStart', 'yStart']);

function isDateRange(value: string): boolean {
  return isSemanticDateOnly(value) || RELATIVE_DATE_REGEX.test(value) || RELATIVE_ANCHORS.has(value);
}

/**
 * Validates that a string is either a `YYYY-MM-DD` absolute date or a
 * relative date token (`-7d`, `-30d`, `-1y`, `mStart`, `yStart`).
 *
 * Use on analytics query DTOs where saved insights need relative ranges.
 * For annotation/event DTOs that require concrete dates, keep `@IsDateOnly()`.
 */
export function IsDateRange(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isDateRange',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a valid date (YYYY-MM-DD) or a relative date range (-7d, -30d, -1y, mStart, yStart)`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && isDateRange(value);
        },
      },
    });
  };
}
