-- Add token column as nullable first so we can populate it from api_keys
ALTER TABLE "projects" ADD COLUMN "token" varchar;
--> statement-breakpoint

-- Copy the key_hash of the first non-revoked api_key for each project
-- (preserves SDK connectivity for existing integrations)
UPDATE projects p
SET token = (
  SELECT key_hash
  FROM api_keys a
  WHERE a.project_id = p.id
    AND a.revoked_at IS NULL
  ORDER BY a.created_at ASC
  LIMIT 1
);
--> statement-breakpoint

-- For projects with no active api_keys — assign a new random token
UPDATE projects SET token = gen_random_uuid()::text WHERE token IS NULL;
--> statement-breakpoint

-- Now enforce NOT NULL + UNIQUE constraints
ALTER TABLE "projects" ALTER COLUMN "token" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_token_unique" UNIQUE("token");
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "token" DROP DEFAULT;
--> statement-breakpoint

-- Drop the api_keys table (no longer needed)
DROP TABLE "api_keys" CASCADE;
