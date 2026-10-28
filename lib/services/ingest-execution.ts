import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db/client';
import { stageIdSchema } from '@/lib/validators/knowledge';
import { IngestBusyError, KnowledgeNotFoundError, KnowledgeValidationError } from '@/lib/services/knowledge-errors';
export { IngestBusyError, IngestSupersededError } from '@/lib/services/knowledge-errors';

type StateRow = { ready: boolean; status: string | null; expired: boolean | null; failureCode: string | null };

export async function readIngestStatus(stageId: string) {
  const id = stageIdSchema.parse(stageId);
  const rows = await prisma.$queryRaw<StateRow[]>`
    SELECT s.has_knowledge_base AS ready, e.status, e.expires_at <= now() AS expired, e.failure_code AS "failureCode"
    FROM stage s LEFT JOIN ingest_execution e ON e.stage_id = s.id WHERE s.id = ${id}::uuid`;
  const row = rows[0];
  if (!row) throw new KnowledgeNotFoundError('stage not found');
  if (row.ready) return { status: 'ready' } as const;
  if (row.status === 'processing') return { status: row.expired ? 'unknown' : 'processing' } as const;
  if (row?.status === 'failed') return { status: 'failed', failureCode: row.failureCode } as const;
  return { status: 'idle' } as const;
}

/** Serialize claimers with publication; automatic callers recheck readiness after acquiring the execution row. */
export async function claimIngest(stageId: string, onlyIfUnready = false) {
  const parsed = stageIdSchema.safeParse(stageId);
  if (!parsed.success) throw new KnowledgeValidationError('stageId must be a uuid');
  const id = parsed.data;
  const stage = await prisma.stage.findUnique({ where: { id }, select: { id: true } });
  if (!stage) throw new KnowledgeNotFoundError('stage not found');
  const executionId = randomUUID();
  await prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ executionId: string }[]>`
      INSERT INTO ingest_execution (stage_id, execution_id, status, expires_at, failure_code)
      VALUES (${id}::uuid, ${executionId}::uuid, 'processing', now() + interval '10 minutes', NULL)
      ON CONFLICT (stage_id) DO UPDATE SET execution_id = EXCLUDED.execution_id,
        status = 'processing', expires_at = EXCLUDED.expires_at, failure_code = NULL, updated_at = now()
      WHERE ingest_execution.status <> 'processing' OR ingest_execution.expires_at <= now()
      RETURNING execution_id::text AS "executionId"`;
    if (!rows.length) throw new IngestBusyError('ingest already processing');
    if (onlyIfUnready) {
      const current = await tx.stage.findUnique({ where: { id }, select: { hasKnowledgeBase: true } });
      if (current?.hasKnowledgeBase) throw new IngestBusyError('knowledge base already ready');
    }
  });
  return executionId;
}

export async function failIngest(stageId: string, executionId: string, failureCode: string) {
  await prisma.$executeRaw`
    UPDATE ingest_execution SET status = 'failed', failure_code = ${failureCode}, updated_at = now()
    WHERE stage_id = ${stageId}::uuid AND execution_id = ${executionId}::uuid AND status = 'processing'`;
}
