import { describe, expect, it } from 'vitest';

import {
  applyValuationAdjustments,
  buildParsedTransactions,
  collectOutOfPeriodIssues,
  type ExtractionState,
} from '@/lib/imports/statement-import/statement-import-service/extraction-helpers';
import { reconcileStatementActivity } from '@/lib/imports/statement-import/reconciliation';
import type {
  ExtractedTransaction,
  StatementMetadata,
} from '@/lib/imports/statement-import/extractors/schemas';

function makeState(params: {
  metadata: StatementMetadata;
  transactions: ExtractedTransaction[];
}): ExtractionState {
  return {
    ...params,
    reconciliation: reconcileStatementActivity({
      metadata: params.metadata,
      transactions: params.transactions,
      toleranceCents: 1,
    }),
  };
}

describe('statement extraction helpers', () => {
  it('converts bank valuation adjustments into synthetic transactions when reconciliation stays balanced', () => {
    const state = makeState({
      metadata: {
        statementType: 'bank_statement',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        beginningBalanceCents: 10_000,
        endingBalanceCents: 10_800,
        reconciliationAdjustments: [{ description: 'Interest adjustment', amountCents: 800 }],
      },
      transactions: [],
    });

    const result = applyValuationAdjustments({
      state,
      issues: [],
      toleranceCents: 1,
    });

    expect(result.issues).toEqual([]);
    expect(result.state.metadata.reconciliationAdjustments).toBeUndefined();
    expect(result.state.transactions).toEqual([
      {
        date: '2026-01-31',
        description: 'Interest adjustment',
        rawDescription: 'Interest adjustment',
        amountCents: 800,
        checkNumber: null,
      },
    ]);
    expect(result.state.reconciliation.status).toBe('ok');
  });

  it('adds a review warning for transactions outside the extracted statement period', () => {
    const issues = collectOutOfPeriodIssues(
      makeState({
        metadata: {
          statementType: 'bank_statement',
          startDate: '2026-01-01',
          endDate: '2026-01-31',
          beginningBalanceCents: null,
          endingBalanceCents: null,
        },
        transactions: [
          {
            date: '2026-02-01',
            description: 'Late transaction',
            rawDescription: 'Late transaction',
            amountCents: -100,
            checkNumber: null,
          },
        ],
      }),
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('out_of_period_transactions');
    expect(issues[0]?.details?.transactionCount).toBe(1);
  });

  it('builds persisted parsed transaction rows with normalized descriptions', () => {
    const rows = buildParsedTransactions({
      statementImportId: '00000000-0000-0000-0000-000000000001',
      orgId: 123,
      transactions: [
        {
          date: '2026-01-15',
          description: 'Coffee Shop',
          rawDescription: 'COFFEE SHOP',
          amountCents: -425,
          checkNumber: null,
        },
      ],
    });

    expect(rows).toMatchObject([
      {
        statementImportId: '00000000-0000-0000-0000-000000000001',
        orgId: 123,
        lineNumber: 1,
        rawDescription: 'COFFEE SHOP',
        description: 'Coffee Shop',
        normalizedDescription: 'coffee shop',
        amountCents: -425,
        checkNumber: null,
      },
    ]);
    expect(rows[0]?.transactionDate).toBeInstanceOf(Date);
  });
});
