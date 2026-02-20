CREATE TABLE "person_distinct_ids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"distinct_id" varchar(400) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "persons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "person_distinct_ids" ADD CONSTRAINT "person_distinct_ids_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_distinct_ids" ADD CONSTRAINT "person_distinct_ids_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "person_distinct_ids_project_distinct_idx" ON "person_distinct_ids" USING btree ("project_id","distinct_id");--> statement-breakpoint
CREATE INDEX "person_distinct_ids_person_id_idx" ON "person_distinct_ids" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "persons_project_id_idx" ON "persons" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "persons_project_updated_at_idx" ON "persons" USING btree ("project_id","updated_at");