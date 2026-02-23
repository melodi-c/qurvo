CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "persons_properties_gin_idx" ON "persons" USING GIN ("properties");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "person_distinct_ids_distinct_id_trgm_idx" ON "person_distinct_ids" USING GIN ("distinct_id" gin_trgm_ops);
