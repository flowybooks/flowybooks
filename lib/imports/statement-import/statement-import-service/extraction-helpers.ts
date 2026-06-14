import type { NewParsedTransaction } from '@/lib/db/schema';
import { enforceLast4AccountNumber } from '@/lib/redaction';
import type {
  ExtractedTransaction,
  StatementMetadata,
} from '@/lib/imports/statement-import/extractors/schemas';
import { resolveReconciliationMismatchWithAI } from '@/lib/imports/statement-import/extractors/reconciliation-resolver';
import type { StatementExtractionIssue } from '@/lib/imports/statement-import/extraction-normalizer';
import { normalizeStatementDescription } from '@/lib/imports/statement-import/normalize-description';
import {
  reconcileStatementActivity,
  type StatementReconciliationResult,
} from '@/lib/imports/statement-import/reconciliation';

import { toUtcDateFromYmd } from '../date-utils';

export type ExtractionState = {
  metadata: StatementMetadata;
  transactions: ExtractedTransaction[];
  reconciliation: StatementReconciliationResult;
};

export async function resolveReconciliationWarning(params: {
  statementImportId: string;
  statementText: string;
  state: ExtractionState;
  toleranceCents: number;
}): Promise<ExtractionState> {
  const { reconciliation, transactions, metadata } = params.state;

  if (
    reconciliation.status !== 'warning' ||
    typeof reconciliation.diffCents !== 'number' ||
    reconciliation.diffCents === 0 ||
    typeof reconciliation.expectedDeltaCents !== 'number' ||
    typeof reconciliation.capturedDeltaCents !== 'number'
  ) {
    return params.state;
  }

  try {
    const resolution = await resolveReconciliationMismatchWithAI({
      statementText: params.statementText,
      metadata,
      transactions,
      expectedDeltaCents: reconciliation.expectedDeltaCents,
      capturedDeltaCents: reconciliation.capturedDeltaCents,
      diffCents: reconciliation.diffCents,
      toleranceCents: params.toleranceCents,
    });

    const excludeSet = new Set(
      resolution.excludeLineNumbers
        .filter((n) => Number.isFinite(n))
        .map((n) => Math.floor(n))
        .filter((n) => n >= 1 && n <= transactions.length),
    );

    const additionalAdjustments = resolution.additionalAdjustments ?? [];
    const additionalAdjustmentsAbsCents = additionalAdjustments.reduce((sum, item) => {
      return sum + Math.abs(item.amountCents);
    }, 0);
    const mergedAdjustments = [
      ...(metadata.reconciliationAdjustments ?? []),
      ...additionalAdjustments,
    ];
    const dedupedAdjustments = dedupeAdjustments(mergedAdjustments);
    const candidateTransactions = transactions.filter((_, index) => !excludeSet.has(index + 1));
    const candidateMetadata = {
      ...metadata,
      reconciliationAdjustments: dedupedAdjustments.length > 0 ? dedupedAdjustments : undefined,
    };
    const candidateReconciliation = reconcileStatementActivity({
      metadata: candidateMetadata,
      transactions: candidateTransactions,
      toleranceCents: params.toleranceCents,
    });
    const excludedTotalAbsCents = Array.from(excludeSet).reduce((sum, lineNumber) => {
      const transaction = transactions[lineNumber - 1];
      return sum + Math.abs(transaction?.amountCents ?? 0);
    }, 0);
    const shouldApplyResolution =
      candidateReconciliation.status === 'ok' &&
      (resolution.confidence === 'high' ||
        (resolution.confidence === 'medium' &&
          additionalAdjustmentsAbsCents === 0 &&
          (excludeSet.size === 0 || excludedTotalAbsCents <= 5_000)));

    if (!shouldApplyResolution) {
      return {
        ...params.state,
        reconciliation: {
          ...reconciliation,
          details: {
            ...reconciliation.details,
            autoResolutionAttempted: true,
            autoResolution: resolution,
          },
        },
      };
    }

    return {
      metadata: candidateMetadata,
      transactions: candidateTransactions,
      reconciliation: {
        ...candidateReconciliation,
        details: {
          ...candidateReconciliation.details,
          autoResolvedFromWarning: true,
          autoResolution: {
            resolution,
            excludedTotalAbsCents,
            excludedTransactions: Array.from(excludeSet)
              .sort((a, b) => a - b)
              .map((lineNumber) => {
                const transaction = transactions[lineNumber - 1]!;
                return {
                  lineNumber,
                  date: transaction.date,
                  rawDescription: transaction.rawDescription,
                  amountCents: transaction.amountCents,
                };
              }),
          },
        },
      },
    };
  } catch (resolutionError) {
    const message = resolutionError instanceof Error ? resolutionError.message : 'Unknown error';
    console.warn(
      `[statement-import:${params.statementImportId}] reconciliation resolution failed: ${message}`,
    );
    return {
      ...params.state,
      reconciliation: {
        ...reconciliation,
        details: {
          ...reconciliation.details,
          autoResolutionAttempted: true,
          autoResolutionError: message,
        },
      },
    };
  }
}

export function applyValuationAdjustments(params: {
  state: ExtractionState;
  issues: StatementExtractionIssue[];
  toleranceCents: number;
}): { state: ExtractionState; issues: StatementExtractionIssue[] } {
  const valueChangeAdjustments = params.state.metadata.reconciliationAdjustments ?? [];

  if (
    params.state.reconciliation.status !== 'ok' ||
    params.state.metadata.statementType !== 'bank_statement' ||
    valueChangeAdjustments.length === 0
  ) {
    return params;
  }

  const endDateCandidate =
    typeof params.state.metadata.endDate === 'string' &&
    params.state.metadata.endDate.trim().length > 0
      ? params.state.metadata.endDate
      : params.state.transactions.reduce<string | null>((latest, transaction) => {
          if (!latest) {
            return transaction.date;
          }
          return transaction.date > latest ? transaction.date : latest;
        }, null);

  if (!endDateCandidate) {
    return {
      state: params.state,
      issues: [
        ...params.issues,
        {
          code: 'invalid_statement_period',
          message:
            'Valuation adjustments were extracted but a valid statement end date could not be determined, so no valuation transactions were created.',
          details: {
            adjustmentCount: valueChangeAdjustments.length,
          },
        },
      ],
    };
  }

  const existingKeys = new Set(
    params.state.transactions.map(
      (transaction) =>
        `${normalizeStatementDescription(transaction.description)}::${transaction.amountCents}`,
    ),
  );
  const valuationTransactions = valueChangeAdjustments
    .filter(
      (item) =>
        item &&
        typeof item.description === 'string' &&
        item.description.trim().length > 0 &&
        typeof item.amountCents === 'number' &&
        Number.isFinite(item.amountCents) &&
        item.amountCents !== 0,
    )
    .map((item) => ({
      date: endDateCandidate,
      description: item.description.trim(),
      rawDescription: item.description.trim(),
      amountCents: Math.trunc(item.amountCents),
      checkNumber: null,
    }))
    .filter((transaction) => {
      const key = `${normalizeStatementDescription(transaction.description)}::${transaction.amountCents}`;
      if (existingKeys.has(key)) {
        return false;
      }
      existingKeys.add(key);
      return true;
    });

  const candidateTransactions =
    valuationTransactions.length > 0
      ? [...params.state.transactions, ...valuationTransactions]
      : params.state.transactions;
  const candidateMetadata = {
    ...params.state.metadata,
    reconciliationAdjustments: undefined,
  };
  const candidateReconciliation = reconcileStatementActivity({
    metadata: candidateMetadata,
    transactions: candidateTransactions,
    toleranceCents: params.toleranceCents,
  });

  if (candidateReconciliation.status !== 'ok') {
    return params;
  }

  const previousDetails =
    params.state.reconciliation.details &&
    typeof params.state.reconciliation.details === 'object' &&
    !Array.isArray(params.state.reconciliation.details)
      ? params.state.reconciliation.details
      : null;

  return {
    issues: params.issues,
    state: {
      metadata: candidateMetadata,
      transactions: candidateTransactions,
      reconciliation: {
        ...candidateReconciliation,
        details: {
          ...candidateReconciliation.details,
          previous: previousDetails,
          valuationAdjustmentsConverted: valueChangeAdjustments,
          valuationTransactionsCreated: valuationTransactions.map((transaction) => ({
            date: transaction.date,
            rawDescription: transaction.rawDescription,
            amountCents: transaction.amountCents,
          })),
        },
      },
    },
  };
}

export function collectOutOfPeriodIssues(state: ExtractionState): StatementExtractionIssue[] {
  if (
    typeof state.metadata.startDate !== 'string' ||
    !state.metadata.startDate ||
    typeof state.metadata.endDate !== 'string' ||
    !state.metadata.endDate
  ) {
    return [];
  }

  const startDate = state.metadata.startDate;
  const endDate = state.metadata.endDate;
  const outOfPeriod = state.transactions
    .map((transaction, index) => ({
      lineNumber: index + 1,
      date: transaction.date,
      rawDescription: transaction.rawDescription,
      amountCents: transaction.amountCents,
    }))
    .filter((transaction) => transaction.date < startDate || transaction.date > endDate);

  if (outOfPeriod.length === 0) {
    return [];
  }

  return [
    {
      code: 'out_of_period_transactions',
      message:
        'Some extracted transactions fall outside the extracted statement period. Import is allowed, but review is recommended.',
      details: {
        startDate,
        endDate,
        transactionCount: outOfPeriod.length,
        transactions: outOfPeriod.slice(0, 25),
      },
    },
  ];
}

export function buildParsedTransactions(params: {
  statementImportId: string;
  orgId: number;
  transactions: ExtractedTransaction[];
}): NewParsedTransaction[] {
  return params.transactions.map((transaction, index) => ({
    statementImportId: params.statementImportId,
    orgId: params.orgId,
    lineNumber: index + 1,
    transactionDate: toUtcDateFromYmd(transaction.date),
    rawDescription: transaction.rawDescription,
    description: transaction.description,
    normalizedDescription: normalizeStatementDescription(transaction.description),
    amountCents: transaction.amountCents,
    checkNumber: transaction.checkNumber ?? null,
  }));
}

export function buildStatementImportExtractionUpdate(params: {
  state: ExtractionState;
  model: string;
  existingSourceInfo: unknown;
  extractionWarnings: { status: 'ok' | 'warning'; issues: StatementExtractionIssue[] };
}) {
  const sourceInfo =
    typeof params.existingSourceInfo === 'object' && params.existingSourceInfo
      ? params.existingSourceInfo
      : {};

  return {
    statementType: params.state.metadata.statementType,
    institutionName:
      typeof params.state.metadata.institutionName === 'string'
        ? params.state.metadata.institutionName
        : undefined,
    accountNumber:
      typeof params.state.metadata.accountNumber === 'string'
        ? enforceLast4AccountNumber(params.state.metadata.accountNumber)
        : null,
    statementStartDate:
      typeof params.state.metadata.startDate === 'string' && params.state.metadata.startDate
        ? toUtcDateFromYmd(params.state.metadata.startDate)
        : undefined,
    statementEndDate:
      typeof params.state.metadata.endDate === 'string' && params.state.metadata.endDate
        ? toUtcDateFromYmd(params.state.metadata.endDate)
        : undefined,
    beginningBalanceCents: params.state.metadata.beginningBalanceCents ?? null,
    endingBalanceCents: params.state.metadata.endingBalanceCents ?? null,
    extractionModel: params.model,
    sourceInfo: {
      ...(sourceInfo as Record<string, unknown>),
      reconciliation: params.state.reconciliation,
      extractionWarnings: params.extractionWarnings,
    },
  };
}

function dedupeAdjustments(
  adjustments: NonNullable<StatementMetadata['reconciliationAdjustments']>,
) {
  const seenAdjustments = new Set<string>();
  return adjustments.filter((adjustment) => {
    const key = `${adjustment.description}::${adjustment.amountCents}`;
    if (seenAdjustments.has(key)) {
      return false;
    }
    seenAdjustments.add(key);
    return true;
  });
}
