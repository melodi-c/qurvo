CREATE TABLE "insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" varchar(1000),
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "insights_project_id_type_idx" ON "insights" USING btree ("project_id", "type");--> statement-breakpoint
ALTER TABLE "widgets" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "widgets" DROP COLUMN "config";--> statement-breakpoint
ALTER TABLE "widgets" ADD COLUMN "insight_id" uuid;--> statement-breakpoint
ALTER TABLE "widgets" ADD CONSTRAINT "widgets_insight_id_insights_id_fk" FOREIGN KEY ("insight_id") REFERENCES "public"."insights"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widgets" ALTER COLUMN "name" DROP NOT NULL;
