ALTER TABLE "cohorts" ADD COLUMN "membership_version" bigint;--> statement-breakpoint
ALTER TABLE "cohorts" ADD COLUMN "membership_computed_at" timestamp with time zone;
