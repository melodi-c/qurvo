ALTER TABLE "ai_conversations" ADD COLUMN "tokens_input" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD COLUMN "tokens_output" integer DEFAULT 0 NOT NULL;
