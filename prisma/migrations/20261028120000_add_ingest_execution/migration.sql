CREATE TABLE "ingest_execution" (
  "stage_id" UUID PRIMARY KEY REFERENCES "stage"("id") ON DELETE CASCADE,
  "execution_id" UUID NOT NULL,
  "status" TEXT NOT NULL CHECK ("status" IN ('processing', 'failed', 'completed')),
  "expires_at" TIMESTAMPTZ NOT NULL,
  "failure_code" TEXT,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
