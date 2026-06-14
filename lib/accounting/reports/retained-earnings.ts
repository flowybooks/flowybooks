import { and, eq, lt, sum } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { accounts, journalBatches, journalLines, type Organization } from '@/lib/db/schema';
import { addUtcDays, startOfAccountingDateUtc } from '@/lib/utils/accounting-date';
import { getFiscalYearBounds } from './fiscal-year';
import { getNetIncomeForRange } from './net-income';

export type RetainedEarningsBreakdown = {
  retainedEarningsLedger: number;
  priorYearsNetIncome: number;
  currentYearNetIncome: number;
  effectiveRetainedEarnings: number;
};

/**
 * Computes the components needed to present Retained Earnings and
 * Current Year Earnings in reports, without posting closing entries.
 *
 * - retainedEarningsLedger: sum of all RE account activity (manual journals)
 * - priorYearsNetIncome: net income from all completed fiscal years
 * - currentYearNetIncome: net income for the current fiscal year to date
 * - effectiveRetainedEarnings: ledger RE + priorYearsNetIncome
 */
export async function getRetainedEarningsBreakdown(params: {
  team: Organization;
  asOfDate: Date;
}): Promise<RetainedEarningsBreakdown> {
  const { team, asOfDate } = params;
  const orgId = team.id;
  const asOfEndExclusive = addUtcDays(startOfAccountingDateUtc(asOfDate), 1);

  const { start: fiscalYearStart } = getFiscalYearBounds(team, asOfDate);
  const priorPeriodEnd = new Date(fiscalYearStart.getTime() - 1);

  // 1) Ledger RE: sum of all Retained Earnings equity accounts up to asOfDate
  const [reRow] = await db
    .select({
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
    .innerJoin(
      accounts,
      and(
        eq(journalLines.accountId, accounts.id),
        eq(accounts.orgId, orgId),
        eq(accounts.type, 'equity'),
        eq(accounts.name, 'Retained Earnings'),
      ),
    )
    .where(and(eq(journalLines.orgId, orgId), lt(journalLines.glDate, asOfEndExclusive)));

  const retainedEarningsLedger = Number(reRow?.creditSum ?? 0) - Number(reRow?.debitSum ?? 0);

  // 2) Prior years' net income: all P&L accounts before current FY start
  const priorYearsNetIncome = await getNetIncomeForRange({
    orgId,
    fromDate: new Date(1970, 0, 1),
    toDate: priorPeriodEnd,
  });

  // 3) Current year net income: P&L from FY start to asOfDate
  const currentYearNetIncome = await getNetIncomeForRange({
    orgId,
    fromDate: fiscalYearStart,
    toDate: asOfDate,
  });

  const effectiveRetainedEarnings = retainedEarningsLedger + priorYearsNetIncome;

  return {
    retainedEarningsLedger,
    priorYearsNetIncome,
    currentYearNetIncome,
    effectiveRetainedEarnings,
  };
}
