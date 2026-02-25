import type { Event, IngestionWarning } from '@qurvo/clickhouse';
import type { PinoLogger } from 'nestjs-pino';
import type { PersonResolverService } from '../person-resolver.service';
import type { PersonBatchStore } from '../person-batch-store';
import type { GeoService } from '../geo.service';

/** Unified context passed to every pipeline step. */
export interface PipelineContext {
  personResolver: PersonResolverService;
  personBatchStore: PersonBatchStore;
  geoService: GeoService;
  logger: PinoLogger;
  onWarning?: (warning: IngestionWarning) => void;
}

/** Raw Redis Stream message after XREADGROUP / XAUTOCLAIM. */
export interface RawMessage {
  id: string;
  fields: Record<string, string>;
}

/** Fields guaranteed to exist after validation. */
export interface ValidatedFields extends Record<string, string> {
  project_id: string;
  event_name: string;
  distinct_id: string;
}

/** Validated message that passed all checks — required fields are guaranteed. */
export interface ValidMessage {
  id: string;
  fields: ValidatedFields;
}

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
