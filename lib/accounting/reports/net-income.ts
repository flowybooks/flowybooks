import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { accounts, journalBatches, journalLines } from '@/lib/db/schema';
import { addUtcDays, startOfAccountingDateUtc } from '@/lib/utils/accounting-date';

export type NetIncomeRangeInput = {
  orgId: number;
  fromDate: Date;
  toDate: Date;
};

/**
 * Computes net income for a date range:
 *   income accounts:  credit - debit
 *   expense accounts: credit - debit
 *   all others:       0
 *
 * Only includes posted journal batches.
 */
export async function getNetIncomeForRange(input: NetIncomeRangeInput): Promise<number> {
  const { orgId, fromDate, toDate } = input;
  const fromStart = startOfAccountingDateUtc(fromDate);
  const toEndExclusive = addUtcDays(startOfAccountingDateUtc(toDate), 1);

  const [row] = await db
    .select({
      net: sql<number>`
        COALESCE(
          SUM(
            CASE
              WHEN ${accounts.type} = 'income'
                THEN (${journalLines.credit} - ${journalLines.debit})
              WHEN ${accounts.type} = 'expense'
                THEN (${journalLines.credit} - ${journalLines.debit})
              ELSE 0
            END
          ),
          0
        )
      `,
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
    .where(
      and(
        eq(journalLines.orgId, orgId),
        gte(journalLines.glDate, fromStart),
        lt(journalLines.glDate, toEndExclusive),
      ),
    );

  return Number(row?.net ?? 0);
}
