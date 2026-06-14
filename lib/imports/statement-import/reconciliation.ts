import type {
  ExtractedTransaction,
  StatementMetadata,
} from '@/lib/imports/statement-import/extractors/schemas';

export type StatementReconciliationStatus = 'ok' | 'warning';

export type StatementReconciliationResult = {
  status: StatementReconciliationStatus;
  expectedDeltaCents: number | null;
  capturedDeltaCents: number | null;
  diffCents: number | null;
  details: Record<string, unknown>;
};

const DEFAULT_TOLERANCE_CENTS = 1; // $0.01

function sumCents(values: Array<number | null | undefined>): number {
  return values.reduce<number>((sum, value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return sum;
    return sum + value;
  }, 0);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function reconcileStatementActivity(params: {
  metadata: StatementMetadata;
  transactions: ExtractedTransaction[];
  toleranceCents?: number;
}): StatementReconciliationResult {
  const { metadata, transactions } = params;
  const toleranceCents =
    typeof params.toleranceCents === 'number' &&
    Number.isFinite(params.toleranceCents) &&
    params.toleranceCents >= 0
      ? Math.floor(params.toleranceCents)
      : DEFAULT_TOLERANCE_CENTS;

  const transactionDeltaCents = sumCents(transactions.map((tx) => tx.amountCents));
  const adjustments = metadata.reconciliationAdjustments ?? [];
  const adjustmentDeltaCents = sumCents(adjustments.map((a) => a.amountCents));

  const beginning = metadata.beginningBalanceCents;
  const ending = metadata.endingBalanceCents;

  if (!isFiniteNumber(beginning) || !isFiniteNumber(ending)) {
    return {
      status: 'warning',
      expectedDeltaCents: null,
      capturedDeltaCents: transactionDeltaCents + adjustmentDeltaCents,
      diffCents: null,
      details: {
        reason: 'missing_balances',
        toleranceCents,
        transactionCount: transactions.length,
        transactionDeltaCents,
        adjustmentCount: adjustments.length,
        adjustmentDeltaCents,
        adjustments,
      },
    };
  }

  const expectedDeltaCents = ending - beginning;
  const capturedDeltaCents = transactionDeltaCents + adjustmentDeltaCents;
  const diffCents = expectedDeltaCents - capturedDeltaCents;
  const status: StatementReconciliationStatus =
    Math.abs(diffCents) <= toleranceCents ? 'ok' : 'warning';

  return {
    status,
    expectedDeltaCents,
    capturedDeltaCents,
    diffCents,
    details: {
      toleranceCents,
      transactionCount: transactions.length,
      transactionDeltaCents,
      adjustmentCount: adjustments.length,
      adjustmentDeltaCents,
      adjustments,
      beginningBalanceCents: beginning,
      endingBalanceCents: ending,
    },
  };
}
