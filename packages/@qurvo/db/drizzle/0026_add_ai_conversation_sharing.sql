ALTER TABLE "ai_conversations" ADD COLUMN "is_shared" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE INDEX "ai_conversations_project_shared_idx" ON "ai_conversations" USING btree ("project_id","is_shared");
