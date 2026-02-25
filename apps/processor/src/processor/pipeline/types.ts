import type { Event } from '@qurvo/clickhouse';

/** Raw Redis Stream message after XREADGROUP / XAUTOCLAIM. */
export interface RawMessage {
  id: string;
  fields: Record<string, string>;
}

/** Validated message that passed all checks. */
export type ValidMessage = RawMessage;

/** Result of the validation step. */
export interface ValidationResult {
  valid: ValidMessage[];
  invalidIds: string[];
}

/** Event ready for buffering — carries both the CH event and the original message ID for XACK. */
export interface BufferedEvent {
  messageId: string;
  event: Event;
}

/** Result of the resolve step. */
export interface ResolveResult {
  buffered: BufferedEvent[];
  failedIds: string[];
}

/** Person key for batch MGET prefetch. */
export interface PersonKey {
  projectId: string;
  distinctId: string;
}
