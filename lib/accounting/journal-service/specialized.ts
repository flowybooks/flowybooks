// This file handles special accounting workflows that are not normal journals.
// It creates and replaces opening balances and prior period adjustments,
// including the automatic plug entries those workflows need.

import { and, eq, inArray } from 'drizzle-orm';

import { ensureSystemEquityAccounts, setBooksStartDateForTeam } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { accounts } from '@/lib/db/schema';

import { createJournalBatchWithStatus, type CreateJournalLineInput } from './shared';
import { voidJournalEntryLifecycle } from './lifecycle';

export type OpeningBalanceLineInput = {
  accountId: string;
  debit?: number;
  credit?: number;
  narration?: string | undefined;
};

export type OpeningBalanceInput = {
  orgId: number;
  asOfDate: Date;
  booksStartDate?: Date | null | undefined;
  createdByUserId?: number | undefined;
  description?: string | undefined;
  lines: OpeningBalanceLineInput[];
};

export type PriorPeriodAdjustmentInput = {
  orgId: number;
  asOfDate: Date;
  createdByUserId?: number | undefined;
  description?: string | undefined;
  reason?: string | undefined;
  lines: OpeningBalanceLineInput[];
};

type AccountInfo = {
  id: string;
  name: string;
  type: (typeof accounts.$inferSelect)['type'];
};

async function fetchAccountsById(
  orgId: number,
  accountIds: string[],
): Promise<Map<string, AccountInfo>> {
  const rows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      type: accounts.type,
    })
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), inArray(accounts.id, accountIds)));

  const map = new Map<string, AccountInfo>();
  for (const row of rows) {
    map.set(row.id, {
      id: row.id,
      name: row.name,
      type: row.type,
    });
  }
  return map;
}

async function getRetainedEarningsAccount(orgId: number): Promise<AccountInfo> {
  const rows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      type: accounts.type,
    })
    .from(accounts)
    .where(
      and(
        eq(accounts.orgId, orgId),
        eq(accounts.type, 'equity'),
        eq(accounts.name, 'Retained Earnings'),
      ),
    )
    .limit(1);

  const retainedEarnings = rows[0];
  if (!retainedEarnings) {
    throw new Error(
      'Retained Earnings account is required but was not found for this organization.',
    );
  }
  return {
    id: retainedEarnings.id,
    name: retainedEarnings.name,
    type: retainedEarnings.type,
  };
}

function normalizeLinesWithDate(
  lines: OpeningBalanceLineInput[],
  asOfDate: Date,
): CreateJournalLineInput[] {
  return lines.map((line, index) => {
    const debit = line.debit ?? 0;
    const credit = line.credit ?? 0;

    if (debit < 0 || credit < 0) {
      throw new Error(`Line ${index + 1}: debit and credit must be non-negative`);
    }
    if (debit === 0 && credit === 0) {
      throw new Error(`Line ${index + 1}: either debit or credit must be greater than 0`);
    }
    if (debit > 0 && credit > 0) {
      throw new Error(`Line ${index + 1}: cannot have both debit and credit populated`);
    }

    return {
      accountId: line.accountId,
      glDate: asOfDate,
      debit,
      credit,
      narration: line.narration,
    };
  });
}

function computePlugLine(params: {
  plugAccountId: string;
  asOfDate: Date;
  description: string;
  lines: CreateJournalLineInput[];
}): CreateJournalLineInput[] {
  const totals = params.lines.reduce(
    (accumulator, line) => ({
      debit: accumulator.debit + (line.debit ?? 0),
      credit: accumulator.credit + (line.credit ?? 0),
    }),
    { debit: 0, credit: 0 },
  );

  const diff = totals.debit - totals.credit;
  if (diff === 0) {
    return params.lines;
  }

  const plugLine: CreateJournalLineInput = {
    accountId: params.plugAccountId,
    glDate: params.asOfDate,
    debit: diff < 0 ? Math.abs(diff) : 0,
    credit: diff > 0 ? Math.abs(diff) : 0,
    narration: params.description,
  };

  return [...params.lines, plugLine];
}

export async function createOpeningBalanceBatch(
  input: OpeningBalanceInput,
): Promise<{ batchId: string }> {
  const asOfDate = new Date(input.asOfDate);
  if (Number.isNaN(asOfDate.getTime())) {
    throw new Error('Invalid as-of date for opening balance');
  }

  if (!input.lines || input.lines.length === 0) {
    throw new Error('At least one opening balance line is required');
  }

  const normalizedLines = normalizeLinesWithDate(input.lines, asOfDate);
  const uniqueAccountIds = Array.from(new Set(normalizedLines.map((line) => line.accountId)));
  const accountMap = await fetchAccountsById(input.orgId, uniqueAccountIds);

  if (accountMap.size !== uniqueAccountIds.length) {
    throw new Error('One or more accounts do not belong to this organization');
  }

  const disallowedNames = ['Opening Balance Equity', 'Prior Period Adjustments'];
  for (const line of normalizedLines) {
    const account = accountMap.get(line.accountId);
    if (!account) {
      continue;
    }
    if (disallowedNames.includes(account.name)) {
      throw new Error(
        `Do not post directly to ${account.name}; it is added automatically as the plug line.`,
      );
    }
  }

  const hasPnl = normalizedLines.some((line) => {
    const account = accountMap.get(line.accountId);
    return account?.type === 'income' || account?.type === 'expense';
  });

  if (hasPnl) {
    const retainedEarnings = await getRetainedEarningsAccount(input.orgId);
    const hasRetainedEarningsLine = normalizedLines.some(
      (line) => line.accountId === retainedEarnings.id,
    );
    if (!hasRetainedEarningsLine) {
      throw new Error(
        'When including income or expense balances, you must include a Retained Earnings line (prior-years only) to avoid double-counting current year earnings.',
      );
    }
  }

  const { openingBalanceEquityAccountId } = await ensureSystemEquityAccounts(input.orgId);

  const description =
    input.description ?? `Opening balance as of ${asOfDate.toISOString().slice(0, 10)}`;

  const linesWithPlug = computePlugLine({
    plugAccountId: openingBalanceEquityAccountId,
    asOfDate,
    description: 'Opening balance plug',
    lines: normalizedLines,
  });

  const sourceRef = {
    asOfDate: asOfDate.toISOString(),
    booksStartDate: (
      input.booksStartDate ?? new Date(asOfDate.getTime() + 24 * 60 * 60 * 1000)
    ).toISOString(),
    includesPnl: hasPnl,
  };

  const result = await createJournalBatchWithStatus(
    {
      orgId: input.orgId,
      date: asOfDate,
      description,
      createdByUserId: input.createdByUserId,
      lines: linesWithPlug,
    },
    'posted',
    {
      sourceType: 'opening_balance',
      sourceRef,
    },
  );

  if (input.booksStartDate !== undefined) {
    await setBooksStartDateForTeam({
      teamId: input.orgId,
      booksStartDate: input.booksStartDate,
      userId: input.createdByUserId,
    });
  }

  return { batchId: result.batchId };
}

export async function createPriorPeriodAdjustmentBatch(
  input: PriorPeriodAdjustmentInput,
): Promise<{ batchId: string }> {
  const asOfDate = new Date(input.asOfDate);
  if (Number.isNaN(asOfDate.getTime())) {
    throw new Error('Invalid as-of date for prior period adjustment');
  }

  if (!input.lines || input.lines.length === 0) {
    throw new Error('At least one adjustment line is required');
  }

  const normalizedLines = normalizeLinesWithDate(input.lines, asOfDate);
  const uniqueAccountIds = Array.from(new Set(normalizedLines.map((line) => line.accountId)));
  const accountMap = await fetchAccountsById(input.orgId, uniqueAccountIds);

  if (accountMap.size !== uniqueAccountIds.length) {
    throw new Error('One or more accounts do not belong to this organization');
  }

  for (const line of normalizedLines) {
    const account = accountMap.get(line.accountId);
    if (!account) {
      continue;
    }
    if (account.type === 'income' || account.type === 'expense') {
      throw new Error(
        `Prior period adjustments must be balance-sheet only. ${account.name} is a ${account.type} account.`,
      );
    }
    if (account.name === 'Prior Period Adjustments') {
      throw new Error(
        'Do not post directly to Prior Period Adjustments; it is added automatically as the plug line.',
      );
    }
  }

  const { priorPeriodAdjustmentsAccountId } = await ensureSystemEquityAccounts(input.orgId);

  const description =
    input.description ?? `Prior period adjustment as of ${asOfDate.toISOString().slice(0, 10)}`;

  const linesWithPlug = computePlugLine({
    plugAccountId: priorPeriodAdjustmentsAccountId,
    asOfDate,
    description: 'Prior period plug',
    lines: normalizedLines,
  });

  const sourceRef = {
    asOfDate: asOfDate.toISOString(),
    reason: input.reason ?? null,
  };

  const result = await createJournalBatchWithStatus(
    {
      orgId: input.orgId,
      date: asOfDate,
      description,
      createdByUserId: input.createdByUserId,
      lines: linesWithPlug,
    },
    'posted',
    {
      sourceType: 'prior_period_adjustment',
      sourceRef,
    },
  );

  return { batchId: result.batchId };
}

export async function replaceOpeningBalanceBatch(params: {
  orgId: number;
  batchId: string;
  replacement: OpeningBalanceInput;
  userId?: number;
}) {
  await voidJournalEntryLifecycle({
    orgId: params.orgId,
    batchId: params.batchId,
    voidedByUserId: params.userId,
  });

  return createOpeningBalanceBatch({
    ...params.replacement,
    orgId: params.orgId,
    createdByUserId: params.userId,
  });
}

export async function replacePriorPeriodAdjustmentBatch(params: {
  orgId: number;
  batchId: string;
  replacement: PriorPeriodAdjustmentInput;
  userId?: number;
}) {
  await voidJournalEntryLifecycle({
    orgId: params.orgId,
    batchId: params.batchId,
    voidedByUserId: params.userId,
  });

  return createPriorPeriodAdjustmentBatch({
    ...params.replacement,
    orgId: params.orgId,
    createdByUserId: params.userId,
  });
}
