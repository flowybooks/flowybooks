import { and, eq, gte, lt, or, sum } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { accounts, journalBatches, journalLines, type Organization } from '@/lib/db/schema';
import { addUtcDays, startOfAccountingDateUtc } from '@/lib/utils/accounting-date';
import { getFiscalYearBounds } from './fiscal-year';

export type IncomeStatementAccountRow = {
  accountId: string;
  code: string;
  name: string;
  type: (typeof accounts.$inferSelect)['type'];
  classification: (typeof accounts.$inferSelect)['classification'];
  periodAmount: number;
  ytdAmount: number;
};

export type IncomeStatementResult = {
  accounts: IncomeStatementAccountRow[];
  totals: {
    periodNetIncome: number;
    ytdNetIncome: number;
  };
};

type Aggregates = {
  accountId: string;
  debitSum: number;
  creditSum: number;
};

/**
 * Income statement for a team over a period.
 *
 * Behavior:
 * - Includes only P&L accounts: accounts.type ∈ {'income', 'expense'}.
 * - Uses only posted journal batches (journal_batches.status = 'posted').
 * - Period amounts use journal_lines.glDate in [fromDate, toDate] (inclusive, date-based).
 * - YTD amounts use journal_lines.glDate in [fiscalYearStart, toDate] (inclusive, date-based),
 *   where fiscalYearStart comes from getFiscalYearBounds(team, toDate).
 *
 * Sign conventions (values are in cents):
 * - Income accounts:  amount = creditSum - debitSum
 * - Expense accounts: amount = debitSum - creditSum
 * - Net income = sum(income amounts) - sum(expense amounts)
 *
 * Returns one row per income/expense account plus:
 * - totals.periodNetIncome
 * - totals.ytdNetIncome
 */
export async function getIncomeStatement(params: {
  team: Organization;
  fromDate: Date;
  toDate: Date;
}): Promise<IncomeStatementResult> {
  const { team, fromDate, toDate } = params;
  const orgId = team.id;

  if (fromDate > toDate) {
    throw new Error('fromDate must be on or before toDate');
  }

  const { start: fiscalYearStart } = getFiscalYearBounds(team, toDate);
  const periodStart = startOfAccountingDateUtc(fromDate);
  const periodEndExclusive = addUtcDays(startOfAccountingDateUtc(toDate), 1);
  const fiscalYearStartDay = startOfAccountingDateUtc(fiscalYearStart);

  const pnlAccounts = await db
    .select({
      id: accounts.id,
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      classification: accounts.classification,
    })
    .from(accounts)
    .where(
      and(eq(accounts.orgId, orgId), or(eq(accounts.type, 'income'), eq(accounts.type, 'expense'))),
    )
    .orderBy(accounts.code);

  if (pnlAccounts.length === 0) {
    return {
      accounts: [],
      totals: { periodNetIncome: 0, ytdNetIncome: 0 },
    };
  }

  const periodAggRows = await db
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
    .where(
      and(
        eq(journalLines.orgId, orgId),
        gte(journalLines.glDate, periodStart),
        lt(journalLines.glDate, periodEndExclusive),
      ),
    )
    .groupBy(journalLines.accountId);

  const periodAgg = new Map<string, Aggregates>();
  for (const row of periodAggRows) {
    periodAgg.set(row.accountId, {
      accountId: row.accountId,
      debitSum: Number(row.debitSum ?? 0),
      creditSum: Number(row.creditSum ?? 0),
    });
  }

  const ytdAggRows = await db
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
    .where(
      and(
        eq(journalLines.orgId, orgId),
        gte(journalLines.glDate, fiscalYearStartDay),
        lt(journalLines.glDate, periodEndExclusive),
      ),
    )
    .groupBy(journalLines.accountId);

  const ytdAgg = new Map<string, Aggregates>();
  for (const row of ytdAggRows) {
    ytdAgg.set(row.accountId, {
      accountId: row.accountId,
      debitSum: Number(row.debitSum ?? 0),
      creditSum: Number(row.creditSum ?? 0),
    });
  }

  const rows: IncomeStatementAccountRow[] = [];

  let periodIncomeTotal = 0;
  let periodExpenseTotal = 0;
  let ytdIncomeTotal = 0;
  let ytdExpenseTotal = 0;

  for (const account of pnlAccounts) {
    const period = periodAgg.get(account.id) ?? {
      accountId: account.id,
      debitSum: 0,
      creditSum: 0,
    };
    const ytd = ytdAgg.get(account.id) ?? {
      accountId: account.id,
      debitSum: 0,
      creditSum: 0,
    };

    const periodAmount =
      account.type === 'income'
        ? period.creditSum - period.debitSum
        : period.debitSum - period.creditSum;

    const ytdAmount =
      account.type === 'income' ? ytd.creditSum - ytd.debitSum : ytd.debitSum - ytd.creditSum;

    rows.push({
      accountId: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      classification: account.classification,
      periodAmount,
      ytdAmount,
    });

    if (account.type === 'income') {
      periodIncomeTotal += periodAmount;
      ytdIncomeTotal += ytdAmount;
    } else {
      periodExpenseTotal += periodAmount;
      ytdExpenseTotal += ytdAmount;
    }
  }

  const periodNetIncome = periodIncomeTotal - periodExpenseTotal;
  const ytdNetIncome = ytdIncomeTotal - ytdExpenseTotal;

  return {
    accounts: rows,
    totals: {
      periodNetIncome,
      ytdNetIncome,
    },
  };
}
