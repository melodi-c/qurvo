import { z } from 'zod';
import { EventPropertiesSchema, EventContextSchema } from './event';

export const ImportEventSchema = z.object({
  event: z.string().min(1).max(255),
  distinct_id: z.string().min(1).max(255),
  anonymous_id: z.string().max(255).optional(),
  properties: EventPropertiesSchema,
  user_properties: EventPropertiesSchema,
  context: EventContextSchema,
  timestamp: z.string().datetime(),
  event_id: z.string().uuid().optional(),
});

export const ImportBatchSchema = z.object({
  events: z.array(ImportEventSchema).min(1).max(5000),
});

export type ImportEvent = z.infer<typeof ImportEventSchema>;
export type ImportBatch = z.infer<typeof ImportBatchSchema>;
