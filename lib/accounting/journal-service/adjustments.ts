// This file handles revision-style journal changes for already-posted entries.
// It creates replacement batches, reversal logic, and idempotency checks so
// journal edits stay audit-friendly and safe if the same request retries.

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { journalBatches, journalLines } from '@/lib/db/schema';
import { hashJsonValue } from '@/lib/utils/hash';

import {
  buildAuditPayload,
  buildReversalLines,
  createAuditEntryTx,
  createJournalBatchWithStatusTx,
  isOnePostedChildPerSupersededUniqueViolation,
  type CreateJournalLineInput,
  type DbTx,
} from './shared';

export type AdjustJournalBatchInput = {
  orgId: number;
  batchId: string;
  userId: number;
  revised: {
    description: string;
    date: Date;
    lines: CreateJournalLineInput[];
    sourceType?: string | null;
    sourceRef?: unknown;
  };
};

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function normalizeNarration(value: string | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? trimmed : null;
}

function computeAdjustmentIdempotencyKey(params: {
  supersededBatchId: string;
  revised: {
    description: string;
    date: Date;
    lines: CreateJournalLineInput[];
  };
}): string {
  const normalizedLines = params.revised.lines
    .map((line) => ({
      accountId: line.accountId,
      glDate: formatDateKey(line.glDate),
      debit: line.debit,
      credit: line.credit,
      narration: normalizeNarration(line.narration),
    }))
    .sort((a, b) => {
      if (a.accountId !== b.accountId) {
        return a.accountId.localeCompare(b.accountId);
      }
      if (a.glDate !== b.glDate) {
        return a.glDate.localeCompare(b.glDate);
      }
      if (a.debit !== b.debit) {
        return a.debit - b.debit;
      }
      if (a.credit !== b.credit) {
        return a.credit - b.credit;
      }
      return String(a.narration ?? '').localeCompare(String(b.narration ?? ''));
    });

  return hashJsonValue({
    supersededBatchId: params.supersededBatchId,
    revised: {
      date: formatDateKey(params.revised.date),
      description: params.revised.description.trim(),
      lines: normalizedLines,
    },
  });
}

function readStringField(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return null;
  }

  const value = (obj as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function getAdjustmentIdempotencyKeyFromSourceRef(sourceRef: unknown): string | null {
  return readStringField(sourceRef, 'adjustmentIdempotencyKey');
}

function getReversalBatchIdFromSourceRef(sourceRef: unknown): string | null {
  return readStringField(sourceRef, 'reversalBatchId');
}

async function resolveExistingAdjustmentOrThrowTx(params: {
  tx: DbTx;
  orgId: number;
  supersededBatchId: string;
  adjustmentIdempotencyKey: string;
}): Promise<{ reversalBatchId: string; revisedBatchId: string }> {
  const revisedRows = await params.tx
    .select({
      id: journalBatches.id,
      sourceRef: journalBatches.sourceRef,
    })
    .from(journalBatches)
    .where(
      and(
        eq(journalBatches.orgId, params.orgId),
        eq(journalBatches.supersedesBatchId, params.supersededBatchId),
        eq(journalBatches.status, 'posted'),
      ),
    )
    .limit(2);

  if (revisedRows.length === 0) {
    throw new Error('Unable to resolve existing revision for this journal entry');
  }

  if (revisedRows.length > 1) {
    throw new Error(
      'This journal has multiple posted revisions. Please run the repair script and try again.',
    );
  }

  const revised = revisedRows[0]!;
  const existingKey = getAdjustmentIdempotencyKeyFromSourceRef(revised.sourceRef);
  if (!existingKey || existingKey !== params.adjustmentIdempotencyKey) {
    throw new Error('This journal entry was edited elsewhere. Refresh and try again.');
  }

  const reversalBatchIdFromRef = getReversalBatchIdFromSourceRef(revised.sourceRef);
  if (reversalBatchIdFromRef) {
    return { reversalBatchId: reversalBatchIdFromRef, revisedBatchId: revised.id };
  }

  const originalBatchIdExpr = sql<string>`(${journalBatches.sourceRef} ->> 'originalBatchId')`;
  const adjustmentKeyExpr = sql<string>`(${journalBatches.sourceRef} ->> 'adjustmentIdempotencyKey')`;

  const reversalRows = await params.tx
    .select({ id: journalBatches.id })
    .from(journalBatches)
    .where(
      and(
        eq(journalBatches.orgId, params.orgId),
        eq(journalBatches.sourceType, 'adjustment_reversal'),
        eq(journalBatches.status, 'posted'),
        eq(originalBatchIdExpr, params.supersededBatchId),
        eq(adjustmentKeyExpr, params.adjustmentIdempotencyKey),
      ),
    )
    .limit(1);

  const reversal = reversalRows[0];
  if (!reversal) {
    throw new Error('Unable to resolve reversal batch for existing journal revision');
  }

  return { reversalBatchId: reversal.id, revisedBatchId: revised.id };
}

async function resolveExistingAdjustmentOrThrowDb(params: {
  orgId: number;
  supersededBatchId: string;
  adjustmentIdempotencyKey: string;
}): Promise<{ reversalBatchId: string; revisedBatchId: string }> {
  return db.transaction((tx) =>
    resolveExistingAdjustmentOrThrowTx({
      tx,
      orgId: params.orgId,
      supersededBatchId: params.supersededBatchId,
      adjustmentIdempotencyKey: params.adjustmentIdempotencyKey,
    }),
  );
}

async function adjustJournalBatchWithKeyTx(params: {
  tx: DbTx;
  input: AdjustJournalBatchInput;
  adjustmentIdempotencyKey: string;
}): Promise<{ reversalBatchId: string; revisedBatchId: string }> {
  const { tx, input, adjustmentIdempotencyKey } = params;

  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`journal_adjust:${input.batchId}`})::bigint)`,
  );

  const batchRows = await tx
    .select({
      id: journalBatches.id,
      orgId: journalBatches.orgId,
      status: journalBatches.status,
      date: journalBatches.date,
      description: journalBatches.description,
    })
    .from(journalBatches)
    .where(and(eq(journalBatches.id, input.batchId), eq(journalBatches.orgId, input.orgId)))
    .limit(1);

  const original = batchRows[0];
  if (!original) {
    throw new Error('Journal not found');
  }
  if (original.status !== 'posted') {
    throw new Error('Only posted journals can be adjusted');
  }

  const existingRevised = await tx
    .select({
      id: journalBatches.id,
      sourceRef: journalBatches.sourceRef,
    })
    .from(journalBatches)
    .where(
      and(
        eq(journalBatches.orgId, input.orgId),
        eq(journalBatches.supersedesBatchId, input.batchId),
        eq(journalBatches.status, 'posted'),
      ),
    )
    .limit(2);

  if (existingRevised.length > 0) {
    return resolveExistingAdjustmentOrThrowTx({
      tx,
      orgId: input.orgId,
      supersededBatchId: input.batchId,
      adjustmentIdempotencyKey,
    });
  }

  const originalLines = await tx
    .select({
      accountId: journalLines.accountId,
      glDate: journalLines.glDate,
      narration: journalLines.narration,
      debit: journalLines.debit,
      credit: journalLines.credit,
    })
    .from(journalLines)
    .where(and(eq(journalLines.batchId, input.batchId), eq(journalLines.orgId, input.orgId)));

  const reversalDate = original.date;
  const reversalLines = buildReversalLines(
    originalLines.map((line) => ({
      accountId: line.accountId,
      glDate: line.glDate,
      debit: line.debit,
      credit: line.credit,
      narration: line.narration ?? undefined,
    })),
  );

  const reversal = await createJournalBatchWithStatusTx(
    tx,
    {
      orgId: input.orgId,
      date: reversalDate,
      description: `Reversal of ${original.description}`,
      createdByUserId: input.userId,
      lines: reversalLines,
    },
    'posted',
    {
      sourceType: 'adjustment_reversal',
      sourceRef: {
        kind: 'reversal',
        originalBatchId: input.batchId,
        adjustmentIdempotencyKey,
      },
      supersedesBatchId: null,
      auditNote: 'auto-reversal created for adjustment',
    },
  );

  const revisedSourceRefBase =
    input.revised.sourceRef &&
    typeof input.revised.sourceRef === 'object' &&
    !Array.isArray(input.revised.sourceRef)
      ? (input.revised.sourceRef as Record<string, unknown>)
      : {};

  const revised = await createJournalBatchWithStatusTx(
    tx,
    {
      orgId: input.orgId,
      date: input.revised.date,
      description: input.revised.description,
      createdByUserId: input.userId,
      lines: input.revised.lines,
    },
    'posted',
    {
      sourceType: input.revised.sourceType ?? 'adjustment',
      sourceRef: {
        ...revisedSourceRefBase,
        kind: 'revised',
        originalBatchId: input.batchId,
        reversalBatchId: reversal.batchId,
        adjustmentIdempotencyKey,
      },
      supersedesBatchId: input.batchId,
      auditNote: 'adjusted journal created',
    },
  );

  await createAuditEntryTx(
    tx,
    buildAuditPayload({
      orgId: input.orgId,
      entityId: input.batchId,
      action: 'update',
      userId: input.userId,
      sourceType: input.revised.sourceType ?? 'adjustment',
      sourceRef: { reversalBatchId: reversal.batchId, revisedBatchId: revised.batchId },
      auditNote: 'journal superseded via adjustment',
      newState: {
        supersededBy: revised.batchId,
        reversalBatchId: reversal.batchId,
        adjustmentIdempotencyKey,
      },
    }),
  );

  return { reversalBatchId: reversal.batchId, revisedBatchId: revised.batchId };
}

export async function adjustJournalBatchTx(tx: DbTx, input: AdjustJournalBatchInput) {
  const adjustmentIdempotencyKey = computeAdjustmentIdempotencyKey({
    supersededBatchId: input.batchId,
    revised: input.revised,
  });

  return adjustJournalBatchWithKeyTx({ tx, input, adjustmentIdempotencyKey });
}

export async function adjustJournalBatch(input: AdjustJournalBatchInput) {
  const adjustmentIdempotencyKey = computeAdjustmentIdempotencyKey({
    supersededBatchId: input.batchId,
    revised: input.revised,
  });

  try {
    return await db.transaction((tx) =>
      adjustJournalBatchWithKeyTx({ tx, input, adjustmentIdempotencyKey }),
    );
  } catch (error) {
    if (isOnePostedChildPerSupersededUniqueViolation(error)) {
      return resolveExistingAdjustmentOrThrowDb({
        orgId: input.orgId,
        supersededBatchId: input.batchId,
        adjustmentIdempotencyKey,
      });
    }
    throw error;
  }
}
