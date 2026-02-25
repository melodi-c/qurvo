ALTER TABLE "ai_messages" ADD COLUMN "prompt_tokens" integer;
ALTER TABLE "ai_messages" ADD COLUMN "completion_tokens" integer;
ALTER TABLE "ai_messages" ADD COLUMN "model_used" varchar(100);
ALTER TABLE "ai_messages" ADD COLUMN "estimated_cost_usd" numeric(12, 8);
