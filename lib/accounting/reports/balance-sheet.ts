import { and, eq, lt, sum } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { accounts, journalBatches, journalLines, type Organization } from '@/lib/db/schema';
import { addUtcDays, startOfAccountingDateUtc } from '@/lib/utils/accounting-date';
import { getRetainedEarningsBreakdown } from './retained-earnings';
import { getFiscalYearBounds } from './fiscal-year';
import { getIncomeStatement } from './income-statement';

export type BalanceSheetSectionRow = {
  accountId?: string;
  code?: string;
  name: string;
  amount: number;
  isVirtual?: boolean;
};

export type BalanceSheetResult = {
  assets: BalanceSheetSectionRow[];
  liabilities: BalanceSheetSectionRow[];
  equity: BalanceSheetSectionRow[];
  totals: {
    assets: number;
    liabilities: number;
    equityPlusCYE: number;
  };
};

export async function getBalanceSheet(params: {
  team: Organization;
  asOfDate: Date;
}): Promise<BalanceSheetResult> {
  const { team, asOfDate } = params;
  const orgId = team.id;
  const asOfEndExclusive = addUtcDays(startOfAccountingDateUtc(asOfDate), 1);

  const accountRows = await db
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

  const lineAggregates = await db
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

  for (const row of lineAggregates) {
    aggregatesByAccount.set(row.accountId, {
      debitSum: Number(row.debitSum ?? 0),
      creditSum: Number(row.creditSum ?? 0),
    });
  }

  const assets: BalanceSheetSectionRow[] = [];
  const liabilities: BalanceSheetSectionRow[] = [];
  const equityReal: BalanceSheetSectionRow[] = [];

  for (const row of accountRows) {
    const sums = aggregatesByAccount.get(row.id) ?? {
      debitSum: 0,
      creditSum: 0,
    };
    const debit = sums.debitSum;
    const credit = sums.creditSum;

    if (row.type === 'asset') {
      const amount = debit - credit;
      assets.push({
        accountId: row.id,
        code: row.code,
        name: row.name,
        amount,
      });
    } else if (row.type === 'liability') {
      const amount = credit - debit;
      liabilities.push({
        accountId: row.id,
        code: row.code,
        name: row.name,
        amount,
      });
    } else if (row.type === 'equity') {
      if (row.name === 'Retained Earnings') {
        // Handled via retained earnings breakdown
        continue;
      }

      const amount = credit - debit;
      equityReal.push({
        accountId: row.id,
        code: row.code,
        name: row.name,
        amount,
      });
    }
  }

  const re = await getRetainedEarningsBreakdown({ team, asOfDate });

  const { start: fiscalYearStart } = getFiscalYearBounds(team, asOfDate);
  const incomeStatement = await getIncomeStatement({
    team,
    fromDate: fiscalYearStart,
    toDate: asOfDate,
  });

  const currentYearNetIncome = incomeStatement.totals.ytdNetIncome;

  const retainedEarningsLine: BalanceSheetSectionRow = {
    name: 'Retained Earnings',
    amount: re.effectiveRetainedEarnings,
    isVirtual: true,
  };

  const currentYearEarningsLine: BalanceSheetSectionRow = {
    name: 'Current Year Earnings',
    amount: currentYearNetIncome,
    isVirtual: true,
  };

  const equity: BalanceSheetSectionRow[] = [
    ...equityReal,
    retainedEarningsLine,
    currentYearEarningsLine,
  ];

  const totalAssets = assets.reduce((sumValue, row) => sumValue + row.amount, 0);
  const totalLiabilities = liabilities.reduce((sumValue, row) => sumValue + row.amount, 0);
  const totalEquityPlusCYE = equity.reduce((sumValue, row) => sumValue + row.amount, 0);

  return {
    assets,
    liabilities,
    equity,
    totals: {
      assets: totalAssets,
      liabilities: totalLiabilities,
      equityPlusCYE: totalEquityPlusCYE,
    },
  };
}
