import { z } from 'zod';
import { TrackEventSchema } from './event';

export const ImportEventSchema = TrackEventSchema.extend({
  timestamp: z.string().datetime(),
  event_id: z.string().uuid().optional(),
});

export const ImportBatchSchema = z.object({
  events: z.array(ImportEventSchema).min(1).max(5000),
});

export type ImportEvent = z.infer<typeof ImportEventSchema>;
export type ImportBatch = z.infer<typeof ImportBatchSchema>;
