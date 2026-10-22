-- Composite association prevents a submission from pointing to a scene in another classroom.
CREATE UNIQUE INDEX "scenes_id_stage_id_key" ON "scenes"("id", "stage_id");

CREATE TABLE "quiz_submissions" (
    "stage_id" UUID NOT NULL,
    "scene_id" UUID NOT NULL,
    "question_id" TEXT NOT NULL,
    "submission_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "answer" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "result" JSONB,
    "failure_code" TEXT,
    "grading_request_id" UUID,
    "execution_id" UUID,
    "grading_started_at" TIMESTAMPTZ(3),
    "grading_expires_at" TIMESTAMPTZ(3),
    "graded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "quiz_submissions_pkey" PRIMARY KEY ("scene_id", "question_id"),
    CONSTRAINT "quiz_submissions_version_check" CHECK ("version" > 0),
    CONSTRAINT "quiz_submissions_question_id_check" CHECK (length(btrim("question_id")) > 0),
    CONSTRAINT "quiz_submissions_answer_check" CHECK (
        jsonb_typeof("answer") = 'object'
        AND "answer" ? 'type'
        AND ("answer"->>'type') IS NOT NULL
        AND "answer"->>'type' IN ('single', 'multiple', 'short_answer')
    ),
    CONSTRAINT "quiz_submissions_status_check" CHECK (
        "status" IN ('pending', 'processing', 'failed', 'completed')
    ),
    CONSTRAINT "quiz_submissions_result_check" CHECK (
        ("status" = 'completed' AND "result" IS NOT NULL
            AND jsonb_typeof("result") = 'object' AND "graded_at" IS NOT NULL AND "failure_code" IS NULL)
        OR ("status" <> 'completed' AND "result" IS NULL AND "graded_at" IS NULL)
    ),
    CONSTRAINT "quiz_submissions_failure_check" CHECK (
        ("status" = 'failed' AND "failure_code" IS NOT NULL AND "failure_code" IN (
            'MODEL_CONFIG_REQUIRED', 'MODEL_CALL_FAILED', 'INVALID_MODEL_RESULT', 'GRADING_TIMEOUT', 'RESULT_SAVE_FAILED'
        )) OR ("status" <> 'failed' AND "failure_code" IS NULL)
    ),
    CONSTRAINT "quiz_submissions_execution_check" CHECK (
        num_nonnulls("grading_request_id", "execution_id", "grading_started_at", "grading_expires_at") = 0
        OR (num_nonnulls("grading_request_id", "execution_id", "grading_started_at", "grading_expires_at") = 4
            AND "grading_expires_at" = "grading_started_at" + INTERVAL '120 seconds')
    ),
    CONSTRAINT "quiz_submissions_state_check" CHECK (
        ("status" <> 'processing' OR "execution_id" IS NOT NULL)
        AND ("status" <> 'pending' OR "execution_id" IS NULL)
        AND ("answer"->>'type' = 'short_answer' OR ("status" = 'completed' AND "execution_id" IS NULL))
        AND ("status" <> 'completed' OR "answer"->>'type' <> 'short_answer' OR "execution_id" IS NOT NULL)
    )
);

CREATE INDEX "quiz_submissions_stage_id_idx" ON "quiz_submissions"("stage_id");

ALTER TABLE "quiz_submissions" ADD CONSTRAINT "quiz_submissions_stage_id_fkey"
    FOREIGN KEY ("stage_id") REFERENCES "stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_submissions" ADD CONSTRAINT "quiz_submissions_scene_id_stage_id_fkey"
    FOREIGN KEY ("scene_id", "stage_id") REFERENCES "scenes"("id", "stage_id") ON DELETE CASCADE ON UPDATE CASCADE;
