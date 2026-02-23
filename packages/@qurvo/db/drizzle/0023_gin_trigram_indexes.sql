CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_definitions_event_name_trgm_idx" ON "event_definitions" USING GIN ("event_name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "property_definitions_property_name_trgm_idx" ON "property_definitions" USING GIN ("property_name" gin_trgm_ops);
