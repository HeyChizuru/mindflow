BEGIN;

LOCK TABLE "chat_turns" IN ACCESS EXCLUSIVE MODE;

CREATE TABLE "chat_sessions" (
  "id" UUID NOT NULL,
  "stage_id" UUID NOT NULL,
  "is_history" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_sessions_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stage"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "chat_sessions_id_stage_id_key" ON "chat_sessions"("id", "stage_id");
CREATE INDEX "chat_sessions_stage_id_last_used_at_id_idx" ON "chat_sessions"("stage_id", "last_used_at", "id");
CREATE INDEX "chat_sessions_last_used_at_id_idx" ON "chat_sessions"("last_used_at", "id");

INSERT INTO "chat_sessions" ("id", "stage_id", "is_history", "created_at", "last_used_at")
SELECT gen_random_uuid(), "stage_id", true, min("created_at"), max("created_at")
FROM "chat_turns" GROUP BY "stage_id";

ALTER TABLE "chat_turns" ADD COLUMN "session_id" UUID;
UPDATE "chat_turns" AS t SET "session_id" = s."id"
FROM "chat_sessions" AS s WHERE s."stage_id" = t."stage_id" AND s."is_history";
ALTER TABLE "chat_turns" ALTER COLUMN "session_id" SET NOT NULL;
ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_session_id_stage_id_fkey"
  FOREIGN KEY ("session_id", "stage_id") REFERENCES "chat_sessions"("id", "stage_id") ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX "chat_turns_stage_id_request_id_key";
DROP INDEX "chat_turns_stage_id_created_at_id_idx";
CREATE UNIQUE INDEX "chat_turns_session_id_request_id_key" ON "chat_turns"("session_id", "request_id");
CREATE INDEX "chat_turns_session_id_created_at_id_idx" ON "chat_turns"("session_id", "created_at", "id");

COMMIT;
