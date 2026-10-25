CREATE TABLE "chat_turns" (
  "id" UUID NOT NULL,
  "stage_id" UUID NOT NULL,
  "scene_id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "question" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reply" TEXT,
  "teacher_id" TEXT,
  "sources" JSONB,
  "failure_code" TEXT,
  "execution_id" UUID,
  "execution_started_at" TIMESTAMPTZ(3),
  "execution_expires_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "chat_turns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_turns_question_check" CHECK ("question" ~ '[^[:space:]]'),
  CONSTRAINT "chat_turns_teacher_check" CHECK ("teacher_id" IS NULL OR "teacher_id" IN ('explainer', 'reasoning_coach', 'application_coach')),
  CONSTRAINT "chat_turns_failure_check" CHECK ("failure_code" IS NULL OR "failure_code" IN ('EXECUTION_FAILED', 'MODEL_FAILED', 'TOOL_FAILED', 'REPLY_INVALID')),
  CONSTRAINT "chat_turns_state_check" CHECK (
    (
      "status" = 'pending' AND "execution_id" IS NULL AND "execution_started_at" IS NULL AND "execution_expires_at" IS NULL
      AND "reply" IS NULL AND "teacher_id" IS NULL AND "sources" IS NULL AND "completed_at" IS NULL AND "failure_code" IS NULL
    ) OR (
      "status" IN ('processing', 'failed', 'completed')
      AND "execution_id" IS NOT NULL AND "execution_started_at" IS NOT NULL AND "execution_expires_at" IS NOT NULL
      AND "execution_expires_at" > "execution_started_at"
      AND (
        ("status" = 'processing' AND "failure_code" IS NULL
          AND "reply" IS NULL AND "teacher_id" IS NULL AND "sources" IS NULL AND "completed_at" IS NULL)
        OR ("status" = 'failed' AND "failure_code" IS NOT NULL
          AND "reply" IS NULL AND "teacher_id" IS NULL AND "sources" IS NULL AND "completed_at" IS NULL)
        OR ("status" = 'completed' AND "failure_code" IS NULL
          AND "reply" IS NOT NULL AND "reply" ~ '[^[:space:]]' AND "teacher_id" IS NOT NULL
          AND "sources" IS NOT NULL AND jsonb_typeof("sources") = 'array'
          AND "completed_at" IS NOT NULL AND "completed_at" >= "execution_started_at" AND "completed_at" < "execution_expires_at")
      )
    )
  )
);
CREATE UNIQUE INDEX "chat_turns_stage_id_request_id_key" ON "chat_turns"("stage_id", "request_id");
CREATE INDEX "chat_turns_stage_id_created_at_id_idx" ON "chat_turns"("stage_id", "created_at", "id");
CREATE INDEX "chat_turns_scene_id_stage_id_idx" ON "chat_turns"("scene_id", "stage_id");
ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_scene_id_stage_id_fkey" FOREIGN KEY ("scene_id", "stage_id") REFERENCES "scenes"("id", "stage_id") ON DELETE CASCADE ON UPDATE CASCADE;
