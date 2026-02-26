import { z } from 'zod';

// Garbage distinct_ids that SDKs or broken clients may send.
// ВАЖНО: держать в синхронизации с apps/processor/src/processor/pipeline/validate.step.ts (ILLEGAL_DISTINCT_IDS)
const ILLEGAL_DISTINCT_IDS = new Set([
  'anonymous', 'null', 'undefined', 'none', 'nil',
  '[object object]', 'nan', 'true', 'false', '0',
  'guest',
]);

const DistinctIdSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((val) => !ILLEGAL_DISTINCT_IDS.has(val.trim().toLowerCase()), {
    message: 'distinct_id contains a reserved or invalid value',
  });

export const EventPropertiesSchema = z
  .record(z.string().max(200), z.unknown())
  .refine((obj) => Object.keys(obj).length <= 200, { message: 'properties must not exceed 200 keys' })
  .optional();

export const EventContextSchema = z.object({
  session_id: z.string().max(128).optional(),
  url: z.string().max(2048).optional(),
  referrer: z.string().max(2048).optional(),
  page_title: z.string().max(500).optional(),
  page_path: z.string().max(2048).optional(),
  device_type: z.string().max(50).optional(),
  browser: z.string().max(100).optional(),
  browser_version: z.string().max(50).optional(),
  os: z.string().max(100).optional(),
  os_version: z.string().max(50).optional(),
  screen_width: z.number().int().optional(),
  screen_height: z.number().int().optional(),
  language: z.string().max(35).optional(),
  timezone: z.string().max(100).optional(),
  sdk_name: z.string().max(100).optional(),
  sdk_version: z.string().max(50).optional(),
}).optional();

export const TrackEventSchema = z.object({
  event: z.string().min(1).max(255),
  distinct_id: DistinctIdSchema,
  anonymous_id: z.string().max(255).optional(),
  properties: EventPropertiesSchema,
  user_properties: EventPropertiesSchema,
  context: EventContextSchema,
  timestamp: z.string().datetime().optional(),
  event_id: z.string().uuid().optional(),
});

export const BatchWrapperSchema = z.object({
  events: z.array(z.unknown()).min(1).max(500),
  sent_at: z.string().datetime().optional(),
});

export type TrackEvent = z.infer<typeof TrackEventSchema>;
