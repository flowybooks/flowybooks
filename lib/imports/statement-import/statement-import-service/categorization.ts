// This file handles assigning accounts to parsed statement transactions.
// It applies saved mappings and AI-assisted categorization so imports move
// from raw extracted rows toward something ready to post to journals.

import {
  findMappingsByDescriptions,
  getAccountsForTeam,
  getParsedTransactionsForImport,
  updateParsedTransaction,
} from '@/lib/db/queries';
import {
  suggestCategoriesForTransactions,
  type CategorizationInputAccount,
  type CategorizationInputTransaction,
  type CategorizationSuggestion,
} from '@/lib/imports/statement-import/ai/categorization-agent';
import { isAiConfigured } from '@/lib/kevin/model-client';

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function autoCategorizeParsedTransactions(params: {
  orgId: number;
  statementImportId: string;
}) {
  const { orgId, statementImportId } = params;
  const startedAt = Date.now();

  const [parsedTransactions, allAccounts] = await Promise.all([
    getParsedTransactionsForImport(statementImportId, orgId),
    getAccountsForTeam(orgId),
  ]);

  const candidateTransactions = parsedTransactions.filter(
    (transaction) =>
      !transaction.isExcluded && !transaction.journalBatchId && !transaction.confirmedAccountId,
  );

  if (candidateTransactions.length === 0) {
    return [];
  }

  const categorizationAccounts = allAccounts.filter((account) => account.isActive);

  if (categorizationAccounts.length === 0) {
    throw new Error('No active accounts available for categorization');
  }

  const mappingKeys = candidateTransactions.flatMap((transaction) => [
    transaction.normalizedDescription,
    transaction.description,
  ]);
  const mappings = await findMappingsByDescriptions(orgId, mappingKeys);
  const mappingByPattern = new Map(
    mappings.map((mapping) => [mapping.descriptionPattern, mapping]),
  );

  const transactionsNeedingAi: typeof candidateTransactions = [];
  const mappingUpdates: Promise<unknown>[] = [];
  let appliedMappings = 0;

  for (const transaction of candidateTransactions) {
    const savedMapping =
      mappingByPattern.get(transaction.normalizedDescription) ??
      mappingByPattern.get(transaction.description);

    if (!savedMapping) {
      transactionsNeedingAi.push(transaction);
      continue;
    }

    appliedMappings += 1;
    mappingUpdates.push(
      updateParsedTransaction(transaction.id, orgId, {
        suggestedAccountId: savedMapping.accountId,
        confirmedAccountId: savedMapping.accountId,
        categoryConfidence: 'high',
        suggestedCategoryReason: 'Matched from saved mapping',
      }),
    );
  }

  if (mappingUpdates.length > 0) {
    await Promise.all(mappingUpdates);
  }

  if (transactionsNeedingAi.length === 0) {
    console.info(
      `[statement-import:${statementImportId}] auto-categorized ${appliedMappings} via mappings in ${Date.now() - startedAt}ms`,
    );
    return [];
  }

  if (!isAiConfigured()) {
    console.info(
      `[statement-import:${statementImportId}] skipped AI categorization because AI is not configured`,
    );
    return [];
  }

  const accountsForAgent: CategorizationInputAccount[] = categorizationAccounts.map((account) => ({
    id: account.id,
    code: account.code,
    name: account.name,
    type: account.type,
    classification: account.classification,
    isActive: account.isActive,
  }));

  const codeToAccountId = new Map(
    categorizationAccounts.map((account) => [account.code, account.id]),
  );

  const batchSizeRaw = process.env.CATEGORIZATION_BATCH_SIZE;
  const batchSizeParsed = batchSizeRaw ? Number(batchSizeRaw) : 25;
  const batchSize =
    Number.isFinite(batchSizeParsed) && batchSizeParsed > 0 ? Math.floor(batchSizeParsed) : 25;

  const batches = chunkArray(transactionsNeedingAi, batchSize);
  const allSuggestions: CategorizationSuggestion[] = [];

  for (const batch of batches) {
    const transactionsForAgent: CategorizationInputTransaction[] = batch.map((transaction) => ({
      id: transaction.id,
      date: transaction.transactionDate.toISOString(),
      description: transaction.description,
      amountCents: transaction.amountCents,
    }));

    const suggestions = await suggestCategoriesForTransactions({
      transactions: transactionsForAgent,
      accounts: accountsForAgent,
    });

    allSuggestions.push(...suggestions);

    await Promise.all(
      suggestions.map((suggestion) => {
        const accountId =
          suggestion.suggestedAccountCode && codeToAccountId.get(suggestion.suggestedAccountCode);

        return updateParsedTransaction(suggestion.transactionId, orgId, {
          suggestedAccountId: accountId ?? null,
          confirmedAccountId: accountId ?? null,
          categoryConfidence: suggestion.confidence,
          suggestedCategoryReason: suggestion.reason,
        });
      }),
    );
  }

  console.info(
    `[statement-import:${statementImportId}] auto-categorized ${appliedMappings} via mappings, ${allSuggestions.length} via AI in ${Date.now() - startedAt}ms (batches=${batches.length}, batchSize=${batchSize})`,
  );

  return allSuggestions;
}
