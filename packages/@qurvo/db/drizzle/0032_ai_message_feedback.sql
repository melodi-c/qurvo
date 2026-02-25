CREATE TABLE "ai_message_feedback" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "message_id" uuid NOT NULL REFERENCES "ai_messages"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "rating" varchar(10) NOT NULL,
  "comment" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
