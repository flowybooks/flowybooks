// This file holds the shared building blocks for the journal service.
// It defines common types, validation helpers, audit helpers, and the
// lower-level batch creation logic that the smaller workflow files reuse.

import { and, eq, inArray } from 'drizzle-orm';

import { canPostJournal } from '@/lib/accounting/journals';
import type { createAuditEntry } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { accounts, auditLog, journalBatches, journalLines } from '@/lib/db/schema';
import { hashJournalSource } from '@/lib/utils/hash';

export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CreateJournalLineInput = {
  accountId: string;
  glDate: Date;
  debit: number;
  credit: number;
  narration?: string | undefined;
  sourceType?: string | null | undefined;
  sourceRef?: unknown | undefined;
};

export type CreateJournalBatchInput = {
  orgId: number;
  date: Date;
  description: string;
  createdByUserId?: number | undefined;
  lines: CreateJournalLineInput[];
};

export type CreateJournalBatchMeta = {
  sourceType?: string | null | undefined;
  sourceRef?: unknown | undefined;
  supersedesBatchId?: string | null | undefined;
  auditNote?: string | null | undefined;
  skipDuplicateCheck?: boolean | undefined;
};

export class DuplicateJournalBatchError extends Error {
  constructor(
    public readonly existingBatchId: string,
    public readonly sourceType: string,
  ) {
    super(
      `A journal batch with this source already exists (batch ID: ${existingBatchId}). ` +
        `This may indicate a duplicate import. If you intended to create a new batch, ` +
        `please modify the source data or void the existing batch first.`,
    );
    this.name = 'DuplicateJournalBatchError';
  }
}

export function buildAuditPayload(params: {
  orgId: number;
  entityId: string;
  action: 'create' | 'post' | 'void' | 'update' | 'unpost';
  userId: number;
  sourceType?: string | null;
  sourceRef?: unknown;
  auditNote?: string | null;
  newState?: unknown;
}) {
  return {
    orgId: params.orgId,
    entityType: 'journal_batch',
    entityId: params.entityId,
    action: params.action,
    source: 'web_ui' as const,
    userId: params.userId,
    newState: params.newState ?? {},
    previousState: null,
    changeReason: params.auditNote ?? null,
    timestamp: new Date(),
  };
}

export function buildReversalLines(lines: CreateJournalLineInput[]): CreateJournalLineInput[] {
  return lines.map((line) => ({
    ...line,
    debit: line.credit,
    credit: line.debit,
  }));
}

export async function ensureLinesArePostable(lines: CreateJournalLineInput[]) {
  for (const [index, line] of lines.entries()) {
    if (!(line.glDate instanceof Date) || Number.isNaN(line.glDate.getTime())) {
      throw new Error(`Line ${index + 1}: GL date is required`);
    }
  }

  const isPostable = canPostJournal(
    lines.map((line) => ({
      debit: line.debit,
      credit: line.credit,
    })),
  );

  if (!isPostable) {
    throw new Error('Journal is not balanced or contains invalid lines');
  }
}

export async function ensureAccountsBelongToOrg(orgId: number, accountIds: string[]) {
  const uniqueIds = Array.from(new Set(accountIds));

  if (uniqueIds.length === 0) {
    throw new Error('Journal must reference at least one account');
  }

  const accountsForOrg = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), inArray(accounts.id, uniqueIds)));

  if (accountsForOrg.length !== uniqueIds.length) {
    throw new Error('One or more accounts do not belong to this organization');
  }
}

export async function ensureAccountsBelongToOrgTx(tx: DbTx, orgId: number, accountIds: string[]) {
  const uniqueIds = Array.from(new Set(accountIds));

  if (uniqueIds.length === 0) {
    throw new Error('Journal must reference at least one account');
  }

  const accountsForOrg = await tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), inArray(accounts.id, uniqueIds)));

  if (accountsForOrg.length !== uniqueIds.length) {
    throw new Error('One or more accounts do not belong to this organization');
  }
}

export async function createAuditEntryTx(tx: DbTx, entry: Parameters<typeof createAuditEntry>[0]) {
  await tx.insert(auditLog).values(entry);
}

async function findDuplicateBatch(
  orgId: number,
  sourceType: string,
  sourceRefHash: string,
): Promise<{ id: string; status: (typeof journalBatches.$inferSelect)['status'] } | null> {
  const existing = await db
    .select({
      id: journalBatches.id,
      status: journalBatches.status,
    })
    .from(journalBatches)
    .where(
      and(
        eq(journalBatches.orgId, orgId),
        eq(journalBatches.sourceType, sourceType),
        eq(journalBatches.sourceRefHash, sourceRefHash),
      ),
    )
    .limit(1);

  return existing[0] ?? null;
}

export function buildReleasedSourceRefHash(params: {
  batchId: string;
  sourceType: string;
  sourceRefHash: string;
}): string {
  return hashJournalSource('released_source_key', {
    batchId: params.batchId,
    sourceType: params.sourceType,
    sourceRefHash: params.sourceRefHash,
  });
}

async function releaseVoidedBatchSourceKey(params: {
  orgId: number;
  batchId: string;
  sourceType: string;
  sourceRefHash: string;
}) {
  const releasedSourceRefHash = buildReleasedSourceRefHash({
    batchId: params.batchId,
    sourceType: params.sourceType,
    sourceRefHash: params.sourceRefHash,
  });

  await db
    .update(journalBatches)
    .set({
      sourceRefHash: releasedSourceRefHash,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(journalBatches.id, params.batchId),
        eq(journalBatches.orgId, params.orgId),
        eq(journalBatches.status, 'voided'),
        eq(journalBatches.sourceType, params.sourceType),
        eq(journalBatches.sourceRefHash, params.sourceRefHash),
      ),
    );
}

function isUniqueConstraintViolation(error: unknown, constraint: string): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const dbError = error as {
    code?: string;
    constraint_name?: string;
    constraint?: string;
    message?: string;
  };

  if (dbError.code !== '23505') {
    return false;
  }

  const constraintName = dbError.constraint_name ?? dbError.constraint;
  if (constraintName) {
    return constraintName === constraint;
  }

  return typeof dbError.message === 'string' && dbError.message.includes(constraint);
}

function isSourceDedupeUniqueViolation(error: unknown): boolean {
  return isUniqueConstraintViolation(error, 'journal_batches_source_dedupe_idx');
}

export function isOnePostedChildPerSupersededUniqueViolation(error: unknown): boolean {
  return isUniqueConstraintViolation(error, 'journal_batches_one_posted_child_per_superseded_idx');
}

export async function createJournalBatchWithStatusTx(
  tx: DbTx,
  input: CreateJournalBatchInput,
  status: 'draft' | 'posted',
  meta: CreateJournalBatchMeta = {},
): Promise<{ batchId: string }> {
  await ensureLinesArePostable(input.lines);
  await ensureAccountsBelongToOrgTx(
    tx,
    input.orgId,
    input.lines.map((line) => line.accountId),
  );

  const sourceRefHash =
    meta.sourceType && meta.sourceRef ? hashJournalSource(meta.sourceType, meta.sourceRef) : null;

  const now = new Date();

  const [batch] = await tx
    .insert(journalBatches)
    .values({
      orgId: input.orgId,
      date: input.date,
      description: input.description,
      status,
      createdBy: input.createdByUserId ?? null,
      supersedesBatchId: meta.supersedesBatchId ?? null,
      sourceType: meta.sourceType ?? null,
      sourceRef: meta.sourceRef ?? null,
      sourceRefHash,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: journalBatches.id });
  if (!batch) {
    throw new Error('Unable to create journal batch.');
  }

  await tx.insert(journalLines).values(
    input.lines.map((line) => ({
      orgId: input.orgId,
      batchId: batch.id,
      accountId: line.accountId,
      glDate: line.glDate,
      narration: line.narration ?? null,
      debit: line.debit,
      credit: line.credit,
      sourceType: line.sourceType ?? meta.sourceType ?? null,
      sourceRef: line.sourceRef ?? meta.sourceRef ?? null,
    })),
  );

  if (input.createdByUserId) {
    await createAuditEntryTx(
      tx,
      buildAuditPayload({
        orgId: input.orgId,
        entityId: batch.id,
        action: status === 'posted' ? 'post' : 'create',
        userId: input.createdByUserId,
        sourceType: meta.sourceType ?? null,
        sourceRef: meta.sourceRef ?? null,
        auditNote: meta.auditNote ?? null,
        newState: {
          description: input.description,
          status,
          sourceType: meta.sourceType ?? null,
          supersedesBatchId: meta.supersedesBatchId ?? null,
        },
      }),
    );
  }

  return { batchId: batch.id };
}

export async function createJournalBatchWithStatus(
  input: CreateJournalBatchInput,
  status: 'draft' | 'posted',
  meta: CreateJournalBatchMeta = {},
): Promise<{ batchId: string }> {
  await ensureLinesArePostable(input.lines);
  await ensureAccountsBelongToOrg(
    input.orgId,
    input.lines.map((line) => line.accountId),
  );

  const sourceRefHash =
    meta.sourceType && meta.sourceRef ? hashJournalSource(meta.sourceType, meta.sourceRef) : null;

  if (sourceRefHash && meta.sourceType && !meta.skipDuplicateCheck) {
    const existingBatch = await findDuplicateBatch(input.orgId, meta.sourceType, sourceRefHash);

    if (existingBatch?.status === 'voided') {
      await releaseVoidedBatchSourceKey({
        orgId: input.orgId,
        batchId: existingBatch.id,
        sourceType: meta.sourceType,
        sourceRefHash,
      });
    }

    const remainingDuplicate = await findDuplicateBatch(
      input.orgId,
      meta.sourceType,
      sourceRefHash,
    );
    if (remainingDuplicate) {
      throw new DuplicateJournalBatchError(remainingDuplicate.id, meta.sourceType);
    }
  }

  const insertBatch = async () =>
    db.transaction(async (tx) => {
      const [batch] = await tx
        .insert(journalBatches)
        .values({
          orgId: input.orgId,
          date: input.date,
          description: input.description,
          status,
          createdBy: input.createdByUserId ?? null,
          supersedesBatchId: meta.supersedesBatchId ?? null,
          sourceType: meta.sourceType ?? null,
          sourceRef: meta.sourceRef ?? null,
          sourceRefHash,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: journalBatches.id });
      if (!batch) {
        throw new Error('Unable to create journal batch.');
      }

      await tx.insert(journalLines).values(
        input.lines.map((line) => ({
          orgId: input.orgId,
          batchId: batch.id,
          accountId: line.accountId,
          glDate: line.glDate,
          narration: line.narration ?? null,
          debit: line.debit,
          credit: line.credit,
          sourceType: line.sourceType ?? meta.sourceType ?? null,
          sourceRef: line.sourceRef ?? meta.sourceRef ?? null,
        })),
      );

      if (input.createdByUserId) {
        await createAuditEntryTx(
          tx,
          buildAuditPayload({
            orgId: input.orgId,
            entityId: batch.id,
            action: status === 'posted' ? 'post' : 'create',
            userId: input.createdByUserId,
            sourceType: meta.sourceType ?? null,
            sourceRef: meta.sourceRef ?? null,
            auditNote: meta.auditNote ?? null,
            newState: {
              description: input.description,
              status,
              sourceType: meta.sourceType ?? null,
              supersedesBatchId: meta.supersedesBatchId ?? null,
            },
          }),
        );
      }

      return { batchId: batch.id };
    });

  try {
    return await insertBatch();
  } catch (error) {
    if (
      sourceRefHash &&
      meta.sourceType &&
      !meta.skipDuplicateCheck &&
      isSourceDedupeUniqueViolation(error)
    ) {
      const duplicate = await findDuplicateBatch(input.orgId, meta.sourceType, sourceRefHash);

      if (duplicate?.status === 'voided') {
        await releaseVoidedBatchSourceKey({
          orgId: input.orgId,
          batchId: duplicate.id,
          sourceType: meta.sourceType,
          sourceRefHash,
        });
        return insertBatch();
      }

      if (duplicate) {
        throw new DuplicateJournalBatchError(duplicate.id, meta.sourceType);
      }
    }

    throw error;
  }
}
