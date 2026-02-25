import type { RawMessage, ValidMessage, ValidationResult, PipelineContext } from './types';

const REQUIRED_FIELDS = ['project_id', 'event_name', 'distinct_id'] as const;

// Garbage distinct_ids that SDKs or broken clients may send — silently drop these events.
// All values MUST be lowercase — the check uses .toLowerCase() on the input.
const ILLEGAL_DISTINCT_IDS = new Set([
  'anonymous', 'null', 'undefined', 'none', 'nil',
  '[object object]', 'nan', 'true', 'false', '0',
]);

/** Step 2: Validate and split into valid events + invalid IDs for XACK. */
export function validateMessages(
  parsed: RawMessage[],
  ctx: PipelineContext,
): ValidationResult {
  const valid: ValidMessage[] = [];
  const invalidIds: string[] = [];
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  for (const item of parsed) {
    const missing = REQUIRED_FIELDS.filter((f) => !item.fields[f]);
    if (missing.length > 0) {
      ctx.logger.warn({ messageId: item.id, missingFields: missing }, 'Dropping invalid event');
      invalidIds.push(item.id);
      if (ctx.onWarning && item.fields['project_id']) {
        ctx.onWarning({
          project_id: item.fields['project_id'],
          type: 'invalid_event',
          details: JSON.stringify({
            event_name: item.fields['event_name'] ?? null,
            distinct_id: item.fields['distinct_id'] ?? null,
            reason: `missing fields: ${missing.join(', ')}`,
          }),
          timestamp: now,
        });
      }
    } else if (ILLEGAL_DISTINCT_IDS.has(item.fields.distinct_id.trim().toLowerCase())) {
      ctx.logger.warn({ messageId: item.id, distinctId: item.fields.distinct_id }, 'Dropping event with illegal distinct_id');
      invalidIds.push(item.id);
      ctx.onWarning?.({
        project_id: item.fields['project_id'],
        type: 'illegal_distinct_id',
        details: JSON.stringify({
          event_name: item.fields['event_name'],
          distinct_id: item.fields['distinct_id'],
          reason: 'illegal distinct_id value',
        }),
        timestamp: now,
      });
    } else {
      // Safe cast: REQUIRED_FIELDS check above guarantees these fields exist
      valid.push(item as ValidMessage);
    }
  }

  return { valid, invalidIds };
}
