import type { PinoLogger } from 'nestjs-pino';
import type { RawMessage, ValidationResult } from './types';

const REQUIRED_FIELDS = ['project_id', 'event_name', 'distinct_id'] as const;

// Garbage distinct_ids that SDKs or broken clients may send — silently drop these events.
// All values MUST be lowercase — the check uses .toLowerCase() on the input.
const ILLEGAL_DISTINCT_IDS = new Set([
  'anonymous', 'null', 'undefined', 'none', 'nil',
  '[object object]', 'nan', 'true', 'false', '0',
]);

/** Step 2: Validate and split into valid events + invalid IDs for XACK. */
export function validateMessages(parsed: RawMessage[], logger: PinoLogger): ValidationResult {
  const valid: RawMessage[] = [];
  const invalidIds: string[] = [];

  for (const item of parsed) {
    const missing = REQUIRED_FIELDS.filter((f) => !item.fields[f]);
    if (missing.length > 0) {
      logger.warn({ messageId: item.id, missingFields: missing }, 'Dropping invalid event');
      invalidIds.push(item.id);
    } else if (ILLEGAL_DISTINCT_IDS.has(item.fields.distinct_id.trim().toLowerCase())) {
      logger.warn({ messageId: item.id, distinctId: item.fields.distinct_id }, 'Dropping event with illegal distinct_id');
      invalidIds.push(item.id);
    } else {
      valid.push(item);
    }
  }

  return { valid, invalidIds };
}
