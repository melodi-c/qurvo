ALTER TABLE "projects" ADD COLUMN "token" varchar NOT NULL DEFAULT gen_random_uuid()::text;
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_token_unique" UNIQUE("token");
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "token" DROP DEFAULT;
--> statement-breakpoint
DROP TABLE "api_keys" CASCADE;
