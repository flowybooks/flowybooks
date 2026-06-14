// This file handles journal batch and journal line lookups.
// It gives pages the journal list, a single journal batch, and the
// journal lines sorted in the order accountants expect to review them.

import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { db } from '../drizzle';
import { accounts, journalBatches, journalLines } from '../schema';
export async function getJournalBatchesForTeam(teamId: number) {
  const rows = await db
    .select()
    .from(journalBatches)
    .where(eq(journalBatches.orgId, teamId))
    .orderBy(desc(journalBatches.updatedAt), desc(journalBatches.date));

  return rows;
}

export async function getJournalBatchForTeam(teamId: number, batchId: string) {
  const rows = await db
    .select()
    .from(journalBatches)
    .where(and(eq(journalBatches.orgId, teamId), eq(journalBatches.id, batchId)))
    .limit(1);

  return rows[0] ?? null;
}

export async function getJournalLinesForBatch(batchId: string, teamId: number) {
  const transactionSequenceSort = sql<number>`coalesce((${journalLines.sourceRef}->>'transactionSequence')::int, 2147483647)`;
  const lineSequenceSort = sql<number>`coalesce((${journalLines.sourceRef}->>'lineSequence')::int, 2147483647)`;

  const rows = await db
    .select()
    .from(journalLines)
    .where(and(eq(journalLines.batchId, batchId), eq(journalLines.orgId, teamId)))
    .orderBy(
      asc(journalLines.glDate),
      asc(transactionSequenceSort),
      asc(lineSequenceSort),
      asc(journalLines.id),
    );

  return rows;
}

export async function getJournalLinesWithAccounts(batchId: string, teamId: number) {
  const transactionSequenceSort = sql<number>`coalesce((${journalLines.sourceRef}->>'transactionSequence')::int, 2147483647)`;
  const lineSequenceSort = sql<number>`coalesce((${journalLines.sourceRef}->>'lineSequence')::int, 2147483647)`;

  const rows = await db
    .select({
      id: journalLines.id,
      narration: journalLines.narration,
      debit: journalLines.debit,
      credit: journalLines.credit,
      accountId: journalLines.accountId,
      glDate: journalLines.glDate,
      accountCode: accounts.code,
      accountName: accounts.name,
      sourceType: journalLines.sourceType,
      sourceRef: journalLines.sourceRef,
    })
    .from(journalLines)
    .leftJoin(accounts, eq(journalLines.accountId, accounts.id))
    .where(
      and(
        eq(journalLines.batchId, batchId),
        eq(journalLines.orgId, teamId),
        eq(accounts.orgId, teamId),
      ),
    )
    .orderBy(
      asc(journalLines.glDate),
      asc(transactionSequenceSort),
      asc(lineSequenceSort),
      asc(journalLines.id),
    );

  return rows;
}
