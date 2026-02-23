ALTER TABLE "property_definitions" ALTER COLUMN "value_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "property_definitions" ALTER COLUMN "value_type" DROP DEFAULT;
