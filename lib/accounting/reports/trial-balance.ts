import { and, eq, gte, lt, sum } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { accounts, journalBatches, journalLines, type Organization } from '@/lib/db/schema';
import { addUtcDays, startOfAccountingDateUtc } from '@/lib/utils/accounting-date';
import { getFiscalYearBounds } from './fiscal-year';
import { getNetIncomeForRange } from './net-income';

export type TrialBalanceRow = {
  accountId: string;
  code: string;
  name: string;
  type: (typeof accounts.$inferSelect)['type'];
  classification: (typeof accounts.$inferSelect)['classification'];
  beginDebit: number;
  beginCredit: number;
  changeDebit: number;
  changeCredit: number;
  endDebit: number;
  endCredit: number;
};

export type GetTrialBalanceInput = {
  orgId: number;
  fromDate: Date;
  toDate: Date;
};

export async function getTrialBalance(input: GetTrialBalanceInput): Promise<TrialBalanceRow[]> {
  if (input.fromDate > input.toDate) {
    throw new Error('fromDate must be on or before toDate');
  }

  const fromStart = startOfAccountingDateUtc(input.fromDate);
  const toEndExclusive = addUtcDays(startOfAccountingDateUtc(input.toDate), 1);

  const accountsForOrg = await db
    .select({
      id: accounts.id,
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      classification: accounts.classification,
    })
    .from(accounts)
    .where(eq(accounts.orgId, input.orgId))
    .orderBy(accounts.code);

  if (accountsForOrg.length === 0) {
    return [];
  }

  const beginAggregates = await db
    .select({
      accountId: journalLines.accountId,
      debitSum: sum(journalLines.debit).mapWith((value) => Number(value ?? 0)),
      creditSum: sum(journalLines.credit).mapWith((value) => Number(value ?? 0)),
    })
    .from(journalLines)
    .innerJoin(
      journalBatches,
      and(eq(journalLines.batchId, journalBatches.id), eq(journalBatches.orgId, input.orgId)),
    )
    .where(
      and(
        eq(journalLines.orgId, input.orgId),
        eq(journalBatches.status, 'posted'),
        lt(journalLines.glDate, fromStart),
      ),
    )
    .groupBy(journalLines.accountId);

  const periodAggregates = await db
    .select({
      accountId: journalLines.accountId,
      debitSum: sum(journalLines.debit).mapWith((value) => Number(value ?? 0)),
      creditSum: sum(journalLines.credit).mapWith((value) => Number(value ?? 0)),
    })
    .from(journalLines)
    .innerJoin(
      journalBatches,
      and(eq(journalLines.batchId, journalBatches.id), eq(journalBatches.orgId, input.orgId)),
    )
    .where(
      and(
        eq(journalLines.orgId, input.orgId),
        eq(journalBatches.status, 'posted'),
        gte(journalLines.glDate, fromStart),
        lt(journalLines.glDate, toEndExclusive),
      ),
    )
    .groupBy(journalLines.accountId);

  const aggregateByAccount = new Map<
    string,
    {
      beginDebitSum: number;
      beginCreditSum: number;
      periodDebitSum: number;
      periodCreditSum: number;
    }
  >();

  for (const row of beginAggregates) {
    const existing = aggregateByAccount.get(row.accountId) ?? {
      beginDebitSum: 0,
      beginCreditSum: 0,
      periodDebitSum: 0,
      periodCreditSum: 0,
    };

    aggregateByAccount.set(row.accountId, {
      ...existing,
      beginDebitSum: row.debitSum,
      beginCreditSum: row.creditSum,
    });
  }

  for (const row of periodAggregates) {
    const existing = aggregateByAccount.get(row.accountId) ?? {
      beginDebitSum: 0,
      beginCreditSum: 0,
      periodDebitSum: 0,
      periodCreditSum: 0,
    };

    aggregateByAccount.set(row.accountId, {
      ...existing,
      periodDebitSum: row.debitSum,
      periodCreditSum: row.creditSum,
    });
  }

  const rows: TrialBalanceRow[] = accountsForOrg.map((account) => {
    const agg = aggregateByAccount.get(account.id) ?? {
      beginDebitSum: 0,
      beginCreditSum: 0,
      periodDebitSum: 0,
      periodCreditSum: 0,
    };

    const beginNet = agg.beginDebitSum - agg.beginCreditSum;
    const periodNet = agg.periodDebitSum - agg.periodCreditSum;
    const endNet = beginNet + periodNet;

    const beginDebit = beginNet > 0 ? beginNet : 0;
    const beginCredit = beginNet < 0 ? -beginNet : 0;

    const changeDebit = periodNet > 0 ? periodNet : 0;
    const changeCredit = periodNet < 0 ? -periodNet : 0;

    const endDebit = endNet > 0 ? endNet : 0;
    const endCredit = endNet < 0 ? -endNet : 0;

    return {
      accountId: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      classification: account.classification,
      beginDebit,
      beginCredit,
      changeDebit,
      changeCredit,
      endDebit,
      endCredit,
    };
  });

  return rows;
}

export type TrialBalanceAsOfRow = {
  accountId: string;
  code: string;
  name: string;
  type: (typeof accounts.$inferSelect)['type'];
  classification: (typeof accounts.$inferSelect)['classification'];
  debit: number;
  credit: number;
  net: number;
};

export type TrialBalanceAsOfResult = {
  accounts: TrialBalanceAsOfRow[];
  currentYearEarnings: { debit: number; credit: number; isVirtual: true } | null;
  totals: { debit: number; credit: number };
};

/**
 * As-of trial balance from inception through `asOfDate`.
 *
 * Aggregates all debits and credits per account and, if needed, includes
 * a virtual Current Year Earnings row for the current fiscal year.
 */
export async function getTrialBalanceAsOf(params: {
  team: Organization;
  asOfDate: Date;
}): Promise<TrialBalanceAsOfResult> {
  const { team, asOfDate } = params;
  const orgId = team.id;
  const asOfEndExclusive = addUtcDays(startOfAccountingDateUtc(asOfDate), 1);

  const accountsForOrg = await db
    .select({
      id: accounts.id,
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      classification: accounts.classification,
    })
    .from(accounts)
    .where(eq(accounts.orgId, orgId))
    .orderBy(accounts.code);

  if (accountsForOrg.length === 0) {
    return {
      accounts: [],
      currentYearEarnings: null,
      totals: { debit: 0, credit: 0 },
    };
  }

  const aggregates = await db
    .select({
      accountId: journalLines.accountId,
      debitSum: sum(journalLines.debit),
      creditSum: sum(journalLines.credit),
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
    .where(and(eq(journalLines.orgId, orgId), lt(journalLines.glDate, asOfEndExclusive)))
    .groupBy(journalLines.accountId);

  const aggregatesByAccount = new Map<string, { debitSum: number; creditSum: number }>();

  for (const row of aggregates) {
    aggregatesByAccount.set(row.accountId, {
      debitSum: Number(row.debitSum ?? 0),
      creditSum: Number(row.creditSum ?? 0),
    });
  }

  const accountRows: TrialBalanceAsOfRow[] = accountsForOrg.map((account) => {
    const sums = aggregatesByAccount.get(account.id) ?? {
      debitSum: 0,
      creditSum: 0,
    };
    const debit = sums.debitSum;
    const credit = sums.creditSum;
    const net = debit - credit;

    return {
      accountId: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      classification: account.classification,
      debit,
      credit,
      net,
    };
  });

  const totals = accountRows.reduce(
    (acc, row) => ({
      debit: acc.debit + row.debit,
      credit: acc.credit + row.credit,
    }),
    { debit: 0, credit: 0 },
  );

  // Compute Current Year Earnings for the fiscal year containing asOfDate
  const { start: fiscalYearStart } = getFiscalYearBounds(team, asOfDate);

  const cyeNet = await getNetIncomeForRange({
    orgId,
    fromDate: fiscalYearStart,
    toDate: asOfDate,
  });

  let currentYearEarnings: TrialBalanceAsOfResult['currentYearEarnings'] = null;

  if (cyeNet !== 0) {
    const debit = cyeNet < 0 ? -cyeNet : 0;
    const credit = cyeNet > 0 ? cyeNet : 0;

    currentYearEarnings = {
      debit,
      credit,
      isVirtual: true,
    };
  }

  return {
    accounts: accountRows,
    currentYearEarnings,
    totals,
  };
}
