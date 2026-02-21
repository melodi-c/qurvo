DO $$ BEGIN
  CREATE TYPE "public"."channel_type" AS ENUM('manual', 'google_ads', 'facebook_ads', 'tiktok_ads', 'custom_api');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "marketing_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"channel_type" "channel_type" DEFAULT 'manual' NOT NULL,
	"integration_config" jsonb,
	"filter_conditions" jsonb DEFAULT '[]'::jsonb,
	"color" varchar(7),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ad_spend" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"spend_date" date NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"note" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "unit_economics_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"purchase_event_name" varchar(200),
	"revenue_property" varchar(200) DEFAULT 'revenue' NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"churn_window_days" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "marketing_channels" ADD CONSTRAINT "marketing_channels_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "marketing_channels" ADD CONSTRAINT "marketing_channels_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ad_spend" ADD CONSTRAINT "ad_spend_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ad_spend" ADD CONSTRAINT "ad_spend_channel_id_marketing_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."marketing_channels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ad_spend" ADD CONSTRAINT "ad_spend_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "unit_economics_config" ADD CONSTRAINT "unit_economics_config_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "unit_economics_config" ADD CONSTRAINT "unit_economics_config_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketing_channels_project_id_idx" ON "marketing_channels" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ad_spend_project_channel_date_idx" ON "ad_spend" USING btree ("project_id", "channel_id", "spend_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ad_spend_project_date_idx" ON "ad_spend" USING btree ("project_id", "spend_date");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unit_economics_config_project_id_idx" ON "unit_economics_config" USING btree ("project_id");
