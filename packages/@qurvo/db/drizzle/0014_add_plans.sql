CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"events_limit" bigint,
	"data_retention_days" integer,
	"max_projects" integer,
	"features" jsonb NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_slug_unique" UNIQUE("slug")
);--> statement-breakpoint
INSERT INTO "plans" ("slug", "name", "events_limit", "data_retention_days", "max_projects", "features", "is_public")
VALUES ('free', 'Free', NULL, NULL, NULL, '{"cohorts": true, "lifecycle": true, "stickiness": true, "api_export": true, "ai_insights": true}', true);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
UPDATE "projects" SET "plan_id" = (SELECT "id" FROM "plans" WHERE "slug" = 'free');
