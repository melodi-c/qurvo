CREATE TYPE "public"."annotation_scope" AS ENUM('project', 'insight');
--> statement-breakpoint
ALTER TABLE "annotations" ADD COLUMN "scope" "public"."annotation_scope" DEFAULT 'project' NOT NULL;--> statement-breakpoint
ALTER TABLE "annotations" ADD COLUMN "insight_id" uuid;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_insight_id_insights_id_fk" FOREIGN KEY ("insight_id") REFERENCES "public"."insights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "annotations_insight_id_idx" ON "annotations" USING btree ("insight_id");
