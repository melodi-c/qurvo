CREATE TABLE "ai_monitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"event_name" varchar(255) NOT NULL,
	"metric" varchar(50) DEFAULT 'count' NOT NULL,
	"threshold_sigma" double precision DEFAULT 2 NOT NULL,
	"channel_type" varchar(20) NOT NULL,
	"channel_config" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_monitors" ADD CONSTRAINT "ai_monitors_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
