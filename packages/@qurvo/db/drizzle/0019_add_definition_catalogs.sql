-- Add last_seen_at to event_definitions
ALTER TABLE "event_definitions" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint

-- Add value_type, is_numerical, last_seen_at to property_definitions
ALTER TABLE "property_definitions" ADD COLUMN "value_type" varchar(20) DEFAULT 'String' NOT NULL;
--> statement-breakpoint
ALTER TABLE "property_definitions" ADD COLUMN "is_numerical" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "property_definitions" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint

-- Remove event_name from property_definitions unique index (make it a global catalog)
DROP INDEX IF EXISTS "property_definitions_project_event_name_type_idx";
--> statement-breakpoint

-- Deduplicate property_definitions before creating the new unique index:
-- Keep the row with the latest updated_at for each (project_id, property_name, property_type)
DELETE FROM "property_definitions" a
  USING "property_definitions" b
  WHERE a.id <> b.id
    AND a.project_id = b.project_id
    AND a.property_name = b.property_name
    AND a.property_type = b.property_type
    AND (a.updated_at < b.updated_at OR (a.updated_at = b.updated_at AND a.id < b.id));
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "property_definitions_project_name_type_idx" ON "property_definitions" USING btree ("project_id","property_name","property_type");
--> statement-breakpoint

-- Remove event_name column from property_definitions (no longer needed, event_properties handles this)
ALTER TABLE "property_definitions" DROP COLUMN IF EXISTS "event_name";
--> statement-breakpoint

-- Create event_properties join table
CREATE TABLE IF NOT EXISTS "event_properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"event_name" varchar(500) NOT NULL,
	"property_name" varchar(500) NOT NULL,
	"property_type" varchar(20) NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_properties" ADD CONSTRAINT "event_properties_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "event_properties_unique_idx" ON "event_properties" USING btree ("project_id","event_name","property_name","property_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_properties_project_event_idx" ON "event_properties" USING btree ("project_id","event_name");
