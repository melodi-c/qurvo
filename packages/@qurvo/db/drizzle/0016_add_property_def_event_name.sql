ALTER TABLE "property_definitions" ADD COLUMN "event_name" varchar(500) DEFAULT '' NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "property_definitions_project_name_type_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "property_definitions_project_event_name_type_idx" ON "property_definitions" USING btree ("project_id","event_name","property_name","property_type");
