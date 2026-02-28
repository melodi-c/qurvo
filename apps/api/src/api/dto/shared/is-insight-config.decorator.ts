import type { ValidationArguments, ValidationOptions } from 'class-validator';
import { registerDecorator } from 'class-validator';

const UUID_ARRAY_FIELDS = ['cohort_ids', 'breakdown_cohort_ids'] as const;

const VALID_TYPES = ['trend', 'funnel', 'retention', 'lifecycle', 'stickiness', 'paths'] as const;

// RFC 4122 UUID v4 pattern
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): boolean {
  return typeof value === 'string' && UUID_V4_RE.test(value);
}

function validateInsightConfig(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return 'config must be a plain object';
  }
  const config = value as Record<string, unknown>;

  if (!VALID_TYPES.includes(config['type'] as (typeof VALID_TYPES)[number])) {
    return `config.type must be one of: ${VALID_TYPES.join(', ')}`;
  }

  for (const field of UUID_ARRAY_FIELDS) {
    const arr = config[field];
    if (arr === undefined || arr === null) {continue;}
    if (!Array.isArray(arr)) {
      return `config.${field} must be an array`;
    }
    for (let i = 0; i < arr.length; i++) {
      if (!isUuid(arr[i])) {
        return `config.${field}[${i}] must be a valid UUID v4`;
      }
    }
  }

  return null;
}

// Module-level cache so the last validation error message can be surfaced in defaultMessage.
// Per-instance keyed by object reference to avoid cross-request pollution in single-process setups.
const errorCache = new WeakMap<object, string>();

/**
 * Validates insight/widget config objects:
 *   1. Must be a plain object
 *   2. Must have a valid `type` discriminator
 *   3. `cohort_ids` and `breakdown_cohort_ids`, when present, must be arrays of valid UUIDs v4
 */
export function IsInsightConfig(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isInsightConfig',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const error = validateInsightConfig(value);
          if (error) {
            errorCache.set(args.object, error);
            return false;
          }
          return true;
        },
        defaultMessage(args: ValidationArguments): string {
          return errorCache.get(args.object) ?? 'config is invalid';
        },
      },
    });
  };
}
