// This file handles the main lifecycle steps for existing journals.
// It covers posting, draft updates, draft deletion, and voiding so the
// rest of the app can call one place for state changes after creation.

import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { journalBatches, journalLines } from '@/lib/db/schema';

import {
  buildAuditPayload,
  buildReleasedSourceRefHash,
  createAuditEntryTx,
  ensureAccountsBelongToOrgTx,
  ensureLinesArePostable,
  type CreateJournalLineInput,
  type DbTx,
} from './shared';

export async function postJournalBatch(params: {
  orgId: number;
  batchId: string;
  postedByUserId?: number;
}): Promise<{ batchId: string }> {
  return db.transaction(async (tx) => {
    const batchRows = await tx
      .select({
        id: journalBatches.id,
        orgId: journalBatches.orgId,
        status: journalBatches.status,
        date: journalBatches.date,
        description: journalBatches.description,
        sourceType: journalBatches.sourceType,
        sourceRef: journalBatches.sourceRef,
      })
      .from(journalBatches)
      .where(and(eq(journalBatches.id, params.batchId), eq(journalBatches.orgId, params.orgId)))
      .limit(1);

    const batch = batchRows[0];
    if (!batch) {
      throw new Error('Journal not found');
    }

    if (batch.status === 'posted') {
      throw new Error('Journal is already posted');
    }

    if (batch.status !== 'draft') {
      throw new Error('Only draft journals can be posted');
    }

    const lines = await tx
      .select({
        debit: journalLines.debit,
        credit: journalLines.credit,
      })
      .from(journalLines)
      .where(and(eq(journalLines.batchId, params.batchId), eq(journalLines.orgId, params.orgId)));

    await ensureLinesArePostable(
      lines.map((line) => ({
        accountId: '',
        glDate: batch.date,
        debit: line.debit,
        credit: line.credit,
      })),
    );

    await tx
      .update(journalBatches)
      .set({
        status: 'posted',
        updatedAt: new Date(),
      })
      .where(and(eq(journalBatches.id, params.batchId), eq(journalBatches.orgId, params.orgId)));

    if (params.postedByUserId) {
      await createAuditEntryTx(
        tx,
        buildAuditPayload({
          orgId: params.orgId,
          entityId: params.batchId,
          action: 'post',
          userId: params.postedByUserId,
          sourceType: batch.sourceType,
          sourceRef: batch.sourceRef,
          auditNote: 'draft journal posted',
          newState: {
            description: batch.description,
            status: 'posted',
          },
        }),
      );
    }

    return { batchId: params.batchId };
  });
}

export async function updateDraftJournalBatch(params: {
  orgId: number;
  batchId: string;
  userId?: number;
  draft: {
    description: string;
    date: Date;
    lines: CreateJournalLineInput[];
  };
}): Promise<{ batchId: string }> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: journalBatches.id,
        orgId: journalBatches.orgId,
        status: journalBatches.status,
        sourceType: journalBatches.sourceType,
        sourceRef: journalBatches.sourceRef,
      })
      .from(journalBatches)
      .where(and(eq(journalBatches.id, params.batchId), eq(journalBatches.orgId, params.orgId)))
      .limit(1);

    const batch = rows[0];
    if (!batch) {
      throw new Error('Journal not found');
    }

    if (batch.status !== 'draft') {
      throw new Error('Only draft journals can be edited');
    }

    await ensureLinesArePostable(params.draft.lines);
    await ensureAccountsBelongToOrgTx(
      tx,
      params.orgId,
      params.draft.lines.map((line) => line.accountId),
    );

    const now = new Date();

    await tx
      .update(journalBatches)
      .set({
        date: params.draft.date,
        description: params.draft.description,
        updatedAt: now,
      })
      .where(and(eq(journalBatches.id, params.batchId), eq(journalBatches.orgId, params.orgId)));

    await tx
      .delete(journalLines)
      .where(and(eq(journalLines.batchId, params.batchId), eq(journalLines.orgId, params.orgId)));

    await tx.insert(journalLines).values(
      params.draft.lines.map((line) => ({
        orgId: params.orgId,
        batchId: params.batchId,
        accountId: line.accountId,
        glDate: line.glDate,
        narration: line.narration ?? null,
        debit: line.debit,
        credit: line.credit,
        sourceType: line.sourceType ?? batch.sourceType ?? null,
        sourceRef: line.sourceRef ?? batch.sourceRef ?? null,
      })),
    );

    if (params.userId) {
      await createAuditEntryTx(
        tx,
        buildAuditPayload({
          orgId: params.orgId,
          entityId: params.batchId,
          action: 'update',
          userId: params.userId,
          sourceType: batch.sourceType,
          sourceRef: batch.sourceRef,
          auditNote: 'draft journal updated',
          newState: {
            description: params.draft.description,
            status: 'draft',
          },
        }),
      );
    }

    return { batchId: params.batchId };
  });
}

export async function deleteDraftJournalBatchTx(
  tx: DbTx,
  params: {
    orgId: number;
    batchId: string;
  },
): Promise<void> {
  const rows = await tx
    .select({
      id: journalBatches.id,
      orgId: journalBatches.orgId,
      status: journalBatches.status,
    })
    .from(journalBatches)
    .where(and(eq(journalBatches.id, params.batchId), eq(journalBatches.orgId, params.orgId)))
    .limit(1);

  const batch = rows[0];
  if (!batch) {
    throw new Error('Journal not found');
  }

  if (batch.status !== 'draft') {
    throw new Error('Only draft journals can be deleted');
  }

  await tx
    .delete(journalLines)
    .where(and(eq(journalLines.batchId, params.batchId), eq(journalLines.orgId, params.orgId)));

  await tx
    .delete(journalBatches)
    .where(and(eq(journalBatches.id, params.batchId), eq(journalBatches.orgId, params.orgId)));
}

export async function deleteDraftJournalBatch(params: {
  orgId: number;
  batchId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await deleteDraftJournalBatchTx(tx, params);
  });
}

export async function voidJournalBatch(params: {
  orgId: number;
  batchId: string;
  voidedByUserId?: number | undefined;
  createAudit?: boolean | undefined;
}): Promise<{ batchId: string }> {
  return voidJournalEntryLifecycle(params);
}

export async function voidJournalEntryLifecycleTx(
  tx: DbTx,
  params: {
    orgId: number;
    batchId: string;
    voidedByUserId?: number | undefined;
    createAudit?: boolean | undefined;
  },
): Promise<{ batchId: string }> {
  let currentId = params.batchId;
  const visitedIds = new Set<string>();
  let rootId: string | null = null;
  let requestedStatus: (typeof journalBatches.$inferSelect)['status'] | null = null;

  while (true) {
    if (visitedIds.has(currentId)) {
      rootId = currentId;
      break;
    }
    visitedIds.add(currentId);

    const [row] = await tx
      .select({
        id: journalBatches.id,
        status: journalBatches.status,
        supersedesBatchId: journalBatches.supersedesBatchId,
      })
      .from(journalBatches)
      .where(and(eq(journalBatches.orgId, params.orgId), eq(journalBatches.id, currentId)))
      .limit(1);

    if (!row) {
      throw new Error('Journal not found');
    }

    if (!requestedStatus) {
      requestedStatus = row.status;
    }

    if (!row.supersedesBatchId) {
      rootId = row.id;
      break;
    }

    currentId = row.supersedesBatchId;
  }

  if (!rootId) {
    throw new Error('Journal not found');
  }

  if (requestedStatus === 'draft') {
    throw new Error('Only posted journals can be voided');
  }

  const lifecycleIds = new Set<string>([rootId]);
  let frontier: string[] = [rootId];

  while (frontier.length > 0) {
    const children = await tx
      .select({ id: journalBatches.id })
      .from(journalBatches)
      .where(
        and(
          eq(journalBatches.orgId, params.orgId),
          inArray(journalBatches.supersedesBatchId, frontier),
        ),
      );

    const next: string[] = [];
    for (const child of children) {
      if (lifecycleIds.has(child.id)) {
        continue;
      }
      lifecycleIds.add(child.id);
      next.push(child.id);
    }
    frontier = next;
  }

  const lifecycleIdList = Array.from(lifecycleIds);
  const originalBatchIdExpr = sql<string>`(${journalBatches.sourceRef} ->> 'originalBatchId')`;

  const reversalRows = await tx
    .select({ id: journalBatches.id })
    .from(journalBatches)
    .where(
      and(
        eq(journalBatches.orgId, params.orgId),
        eq(journalBatches.sourceType, 'adjustment_reversal'),
        inArray(originalBatchIdExpr, lifecycleIdList),
      ),
    );

  const allBatchIds = Array.from(
    new Set([...lifecycleIdList, ...reversalRows.map((row) => row.id)]),
  );

  if (allBatchIds.length === 0) {
    return { batchId: rootId };
  }

  const batches = await tx
    .select({
      id: journalBatches.id,
      status: journalBatches.status,
      sourceType: journalBatches.sourceType,
      sourceRef: journalBatches.sourceRef,
      sourceRefHash: journalBatches.sourceRefHash,
    })
    .from(journalBatches)
    .where(and(eq(journalBatches.orgId, params.orgId), inArray(journalBatches.id, allBatchIds)));

  const now = new Date();
  for (const batch of batches) {
    if (batch.status !== 'posted') {
      continue;
    }

    const releasedSourceRefHash =
      batch.sourceType && batch.sourceRefHash
        ? buildReleasedSourceRefHash({
            batchId: batch.id,
            sourceType: batch.sourceType,
            sourceRefHash: batch.sourceRefHash,
          })
        : batch.sourceRefHash;

    await tx
      .update(journalBatches)
      .set({
        status: 'voided',
        sourceRefHash: releasedSourceRefHash,
        updatedAt: now,
      })
      .where(and(eq(journalBatches.id, batch.id), eq(journalBatches.orgId, params.orgId)));

    if (params.voidedByUserId && params.createAudit !== false) {
      await createAuditEntryTx(
        tx,
        buildAuditPayload({
          orgId: params.orgId,
          entityId: batch.id,
          action: 'void',
          userId: params.voidedByUserId,
          sourceType: batch.sourceType,
          sourceRef: batch.sourceRef,
          auditNote: 'journal deleted from user-facing ledger',
          newState: {
            status: 'voided',
          },
        }),
      );
    }
  }

  return { batchId: rootId };
}

export async function voidJournalEntryLifecycle(params: {
  orgId: number;
  batchId: string;
  voidedByUserId?: number | undefined;
  createAudit?: boolean | undefined;
}): Promise<{ batchId: string }> {
  return db.transaction((tx) => voidJournalEntryLifecycleTx(tx, params));
}
