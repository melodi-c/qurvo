CREATE TYPE "public"."notification_channel_type" AS ENUM('slack', 'email', 'telegram');
--> statement-breakpoint
ALTER TABLE "ai_monitors" ALTER COLUMN "channel_type" SET DATA TYPE "public"."notification_channel_type" USING "channel_type"::"public"."notification_channel_type";
--> statement-breakpoint
ALTER TABLE "ai_scheduled_jobs" ALTER COLUMN "channel_type" SET DATA TYPE "public"."notification_channel_type" USING "channel_type"::"public"."notification_channel_type";
