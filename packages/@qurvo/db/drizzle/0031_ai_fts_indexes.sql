CREATE INDEX IF NOT EXISTS "ai_conversations_title_fts" ON "ai_conversations" USING GIN(to_tsvector('russian', coalesce("title", '')));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_messages_content_fts" ON "ai_messages" USING GIN(to_tsvector('russian', coalesce("content", '')));
