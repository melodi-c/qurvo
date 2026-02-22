CREATE TABLE IF NOT EXISTS "event_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"event_name" varchar(500) NOT NULL,
	"description" varchar(1000),
	"tags" text[] DEFAULT '{}' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_definitions" ADD CONSTRAINT "event_definitions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "event_definitions_project_name_idx" ON "event_definitions" USING btree ("project_id","event_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_definitions_project_id_idx" ON "event_definitions" USING btree ("project_id");
