ALTER TABLE "ai_scheduled_jobs" ALTER COLUMN "channel_config" SET DATA TYPE jsonb USING "channel_config"::jsonb;
