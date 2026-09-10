-- CreateTable
CREATE TABLE "stage" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "requirement" TEXT NOT NULL DEFAULT '',
    "language_directive" TEXT,
    "has_knowledge_base" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "preview_phase" TEXT NOT NULL DEFAULT 'preparing',
    "outlines" JSONB NOT NULL DEFAULT '[]',
    "outlines_status" TEXT NOT NULL DEFAULT 'draft',
    "scene_outlines" JSONB,
    "outline_confirmed_at" TIMESTAMP(3),
    "generation_session_id" INTEGER NOT NULL DEFAULT 1,
    "last_critic_report" JSONB,
    "current_scene_id" UUID,
    "agent_ids" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stage_pkey" PRIMARY KEY ("id")
);
