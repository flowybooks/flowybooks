import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { accounts, journalBatches, journalLines } from '@/lib/db/schema';
import { addUtcDays, startOfAccountingDateUtc } from '@/lib/utils/accounting-date';

export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type DbLike = Pick<typeof db, 'select'>;

export type GeneralLedgerLine = {
  id: string;
  glDate: Date;
  batchId: string;
  batchDate: Date;
  batchDescription: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  narration: string | null;
  debit: number;
  credit: number;
};

export type GetGeneralLedgerInput = {
  orgId: number;
  fromDate: Date;
  toDate: Date;
  accountIds?: string[] | undefined;
  accountCode?: string | undefined;
};

async function getGeneralLedgerInternal(
  executor: DbLike,
  input: GetGeneralLedgerInput,
): Promise<GeneralLedgerLine[]> {
  const { orgId, fromDate, toDate, accountIds, accountCode } = input;

  if (fromDate > toDate) {
    throw new Error('fromDate must be on or before toDate');
  }

  const fromStart = startOfAccountingDateUtc(fromDate);
  const toEndExclusive = addUtcDays(startOfAccountingDateUtc(toDate), 1);

  const conditions = [
    eq(journalLines.orgId, orgId),
    gte(journalLines.glDate, fromStart),
    lt(journalLines.glDate, toEndExclusive),
  ];

  const normalizedAccountIds =
    Array.isArray(accountIds) && accountIds.length > 0 ? accountIds : null;
  if (normalizedAccountIds) {
    conditions.push(inArray(journalLines.accountId, normalizedAccountIds));
  }

  const trimmedAccountCode = typeof accountCode === 'string' ? accountCode.trim() : '';
  if (!normalizedAccountIds && trimmedAccountCode) {
    conditions.push(eq(accounts.code, trimmedAccountCode));
  }

  const rows = await executor
    .select({
      id: journalLines.id,
      glDate: journalLines.glDate,
      batchId: journalBatches.id,
      batchDate: journalBatches.date,
      batchDescription: journalBatches.description,
      accountId: accounts.id,
      accountCode: accounts.code,
      accountName: accounts.name,
      narration: journalLines.narration,
      debit: journalLines.debit,
      credit: journalLines.credit,
    })
    .from(journalLines)
    .innerJoin(
      journalBatches,
      and(
        eq(journalLines.batchId, journalBatches.id),
        eq(journalBatches.orgId, orgId),
        eq(journalBatches.status, 'posted'),
      ),
    )
    .innerJoin(accounts, and(eq(journalLines.accountId, accounts.id), eq(accounts.orgId, orgId)))
    .where(and(...conditions))
    .orderBy(
      asc(journalLines.glDate),
      asc(journalBatches.date),
      asc(accounts.code),
      asc(journalLines.id),
    );

  return rows.map((row) => ({
    id: row.id,
    glDate: row.glDate,
    batchId: row.batchId,
    batchDate: row.batchDate,
    batchDescription: row.batchDescription,
    accountId: row.accountId,
    accountCode: row.accountCode,
    accountName: row.accountName,
    narration: row.narration,
    debit: Number(row.debit ?? 0),
    credit: Number(row.credit ?? 0),
  }));
}

export async function getGeneralLedger(input: GetGeneralLedgerInput): Promise<GeneralLedgerLine[]> {
  return getGeneralLedgerInternal(db, input);
}

export async function getGeneralLedgerTx(
  tx: DbTx,
  input: GetGeneralLedgerInput,
): Promise<GeneralLedgerLine[]> {
  return getGeneralLedgerInternal(tx, input);
}
