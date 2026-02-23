ALTER TABLE "cohorts" ADD COLUMN "errors_calculating" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cohorts" ADD COLUMN "last_error_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cohorts" ADD COLUMN "last_error_message" varchar(500);
