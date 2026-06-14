// This file orchestrates statement extraction. The detailed reconciliation and
// persistence shaping live in small helpers so this workflow stays readable.

import {
  createParsedTransactions,
  getStatementImportById,
  updateStatementImport,
} from '@/lib/db/queries';
import { reconcileStatementActivity } from '@/lib/imports/statement-import/reconciliation';

import { normalizeStatementExtraction } from '../extraction-normalizer';
import { extractStatementWithAI } from '../extractors/ai-extractor';
import { normalizeTransactionAmountsForStatementType } from '../transaction-normalizer';
import { autoCategorizeParsedTransactions } from './categorization';
import {
  applyValuationAdjustments,
  buildParsedTransactions,
  buildStatementImportExtractionUpdate,
  collectOutOfPeriodIssues,
  resolveReconciliationWarning,
  type ExtractionState,
} from './extraction-helpers';

interface ExtractStatementParams {
  statementImportId: string;
  orgId: number;
}

interface ExtractStatementResult {
  transactionCount: number;
  model: string;
}

export async function extractStatement(
  params: ExtractStatementParams,
): Promise<ExtractStatementResult> {
  const { statementImportId, orgId } = params;
  const startedAt = Date.now();

  const statementImport = await getStatementImportById(statementImportId, orgId);
  if (!statementImport) {
    throw new Error('Statement import not found');
  }

  if (statementImport.status !== 'uploaded') {
    throw new Error(`Cannot extract: status is ${statementImport.status}`);
  }

  await updateStatementImport(statementImportId, orgId, {
    status: 'extracting',
    errorMessage: '',
  });

  try {
    if (!statementImport.sourceText?.trim()) {
      throw new Error(
        'No stored statement text found for this import. Please re-upload the statement.',
      );
    }

    console.info(
      `[statement-import:${statementImportId}] extraction started (textLength=${statementImport.sourceText.length})`,
    );

    const { extraction, model } = await extractStatementWithAI(statementImport.sourceText, {
      statementTypeHint: statementImport.statementType ?? undefined,
    });

    console.info(
      `[statement-import:${statementImportId}] extraction AI finished in ${Date.now() - startedAt}ms (tx=${extraction.transactions.length})`,
    );

    const normalizedExtraction = normalizeStatementExtraction({
      metadata: extraction.metadata,
      transactions: extraction.transactions,
    });
    const normalizedTransactions = normalizeTransactionAmountsForStatementType(
      normalizedExtraction.transactions,
      statementImport.statementType ?? normalizedExtraction.metadata.statementType,
    );
    const toleranceCents = 1;

    let state: ExtractionState = {
      metadata: normalizedExtraction.metadata,
      transactions: normalizedTransactions,
      reconciliation: reconcileStatementActivity({
        metadata: normalizedExtraction.metadata,
        transactions: normalizedTransactions,
        toleranceCents,
      }),
    };

    state = await resolveReconciliationWarning({
      statementImportId,
      statementText: statementImport.sourceText,
      state,
      toleranceCents,
    });

    const valuationResult = applyValuationAdjustments({
      state,
      issues: normalizedExtraction.issues,
      toleranceCents,
    });
    state = valuationResult.state;

    const extractionIssues = [...valuationResult.issues, ...collectOutOfPeriodIssues(state)];
    const extractionWarnings = {
      status: extractionIssues.length > 0 ? ('warning' as const) : ('ok' as const),
      issues: extractionIssues,
    };
    const transactions = buildParsedTransactions({
      statementImportId,
      orgId,
      transactions: state.transactions,
    });

    await createParsedTransactions(transactions);

    console.info(
      `[statement-import:${statementImportId}] saved parsed transactions in ${Date.now() - startedAt}ms`,
    );

    await updateStatementImport(statementImportId, orgId, {
      ...buildStatementImportExtractionUpdate({
        state: {
          ...state,
          metadata: {
            ...state.metadata,
            statementType: statementImport.statementType ?? state.metadata.statementType,
          },
        },
        model,
        existingSourceInfo: statementImport.sourceInfo,
        extractionWarnings,
      }),
    });

    try {
      await autoCategorizeParsedTransactions({
        orgId,
        statementImportId,
      });
    } catch (categorizationError) {
      const message =
        categorizationError instanceof Error ? categorizationError.message : 'Unknown error';
      console.error(
        `[statement-import:${statementImportId}] auto-categorization failed: ${message}`,
      );
    }

    await updateStatementImport(statementImportId, orgId, { status: 'extracted' });

    return {
      transactionCount: transactions.length,
      model,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await updateStatementImport(statementImportId, orgId, {
      status: 'failed',
      errorMessage,
    });
    throw error;
  }
}
