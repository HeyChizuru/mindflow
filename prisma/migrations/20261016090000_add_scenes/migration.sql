CREATE TABLE "scenes" (
    "id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "outline_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scenes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "scenes_stage_id_outline_id_key" ON "scenes"("stage_id", "outline_id");
CREATE INDEX "scenes_stage_id_order_idx" ON "scenes"("stage_id", "order");

ALTER TABLE "scenes" ADD CONSTRAINT "scenes_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
