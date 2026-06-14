'use server';

import {
  getStatementImportsForTeam,
  updateParsedTransaction,
  getAccountsForTeam,
  getStatementImportById,
  getParsedTransactionById,
  getParsedTransactionBatchRowsForImports,
  hasAnyCategorizedTransactionsForTeam,
  updateStatementImport,
  deleteStatementImport,
  requireTeam,
  saveOrUpdateMapping,
  requireActiveCoa,
  setParsedTransactionsExcludedForUnposted,
} from '@/lib/db/queries';
import { revalidatePath } from 'next/cache';
import { requireTeamRole } from '@/lib/auth/middleware';
import { normalizeStatementDescription } from '@/lib/imports/statement-import/normalize-description';
import {
  postStatementImportBatchToJournal,
  unpostStatementImportBatch,
} from '@/lib/imports/statement-import/posting-service';

export async function listStatementImportsForCurrentTeam() {
  const team = await requireTeam();
  return getStatementImportsForTeam(team.id);
}

export type BatchSummary = {
  importBatchId: string;
  createdAt: Date;
  modifiedAt: Date;
  linkedAccountId: string | null;
  statementType: string | null;
  fileCount: number;
  transactionCount: number;
  categorizedCount: number;
  uncategorizedCount: number;
  postedCount: number;
  status: 'processing' | 'failed' | 'ready' | 'imported';
};

async function assertAccountsBelongToTeam(teamId: number, accountIds: string[]) {
  const uniqueAccountIds = Array.from(
    new Set(accountIds.map((accountId) => accountId.trim()).filter(Boolean)),
  );

  if (uniqueAccountIds.length === 0) {
    return;
  }

  const accountRows = await getAccountsForTeam(teamId);
  const validAccountIds = new Set(accountRows.map((account) => account.id));
  const invalidAccountId = uniqueAccountIds.find((accountId) => !validAccountIds.has(accountId));

  if (invalidAccountId) {
    throw new Error('One or more selected accounts do not belong to this organization');
  }
}

async function assertStatementAccountBelongsToTeam(teamId: number, accountId: string) {
  const accountRows = await getAccountsForTeam(teamId);
  const account = accountRows.find((row) => row.id === accountId);

  if (!account) {
    throw new Error('Selected statement account does not belong to this organization');
  }

  if (!account.isStatementAccount) {
    throw new Error('Selected account is not marked as a statement account');
  }
}

export async function listBatchesForCurrentTeam(): Promise<BatchSummary[]> {
  const team = await requireTeam();
  const imports = await getStatementImportsForTeam(team.id);

  // Group by import_batch_id
  const batchMap = new Map<string, typeof imports>();
  for (const imp of imports) {
    const batchId = imp.importBatchId;
    const group = batchMap.get(batchId) ?? [];
    group.push(imp);
    batchMap.set(batchId, group);
  }

  // We need transaction counts per batch — fetch all parsed transactions
  // for the team and group by statementImportId → batchId
  const allTransactions = await getParsedTransactionBatchRowsForImports(team.id, imports);

  const batches: BatchSummary[] = [];

  for (const [batchId, batchImports] of batchMap) {
    const primaryImport = batchImports[0]!;
    // Use earliest createdAt
    const createdAt = batchImports.reduce(
      (earliest, imp) => (imp.createdAt < earliest ? imp.createdAt : earliest),
      primaryImport.createdAt,
    );
    const modifiedAt = batchImports.reduce(
      (latest, imp) => (imp.updatedAt > latest ? imp.updatedAt : latest),
      primaryImport.updatedAt,
    );

    // Derive batch status
    const statuses = batchImports.map((imp) => imp.status);
    let status: BatchSummary['status'] = 'ready';
    if (statuses.some((s) => s === 'extracting' || s === 'uploaded')) {
      status = 'processing';
    } else if (statuses.some((s) => s === 'failed')) {
      status = 'failed';
    } else if (statuses.every((s) => s === 'imported')) {
      status = 'imported';
    }

    // Collect transactions for this batch
    const importIds = new Set(batchImports.map((imp) => imp.id));
    const batchTxns = allTransactions.filter((tx) => importIds.has(tx.statementImportId));
    const activeTxns = batchTxns.filter((tx) => !tx.isExcluded);

    batches.push({
      importBatchId: batchId,
      createdAt,
      modifiedAt,
      linkedAccountId: primaryImport.linkedAccountId,
      statementType: primaryImport.statementType,
      fileCount: batchImports.length,
      transactionCount: batchTxns.length,
      categorizedCount: activeTxns.filter((tx) => tx.confirmedAccountId).length,
      uncategorizedCount: activeTxns.filter((tx) => !tx.confirmedAccountId).length,
      postedCount: activeTxns.filter((tx) => tx.journalBatchId).length,
      status,
    });
  }

  // Sort by most recently modified first
  batches.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
  return batches;
}

export async function listAccountsForCategorization() {
  const team = await requireTeam();
  const accounts = await getAccountsForTeam(team.id);
  // Return all active accounts for categorization (including balance sheet)
  return accounts.filter((a) => a.isActive);
}

export async function listStatementAccounts() {
  const team = await requireTeam();
  const accounts = await getAccountsForTeam(team.id);
  // Return only active accounts explicitly marked as statement accounts
  return accounts.filter((a) => a.isActive && a.isStatementAccount);
}

export async function deleteStatementImportForCurrentTeam(importId: string) {
  const { team } = await requireTeamRole(['owner', 'member', 'advisor', 'bookkeeper']);
  const statementImport = await getStatementImportById(importId, team.id);
  if (!statementImport) {
    throw new Error('Statement import not found');
  }
  if (statementImport.status === 'extracting') {
    throw new Error('Cannot delete while extraction is running');
  }

  await deleteStatementImport(importId, team.id);
  revalidatePath('/dashboard/statement-imports');
}

export async function setLinkedAccount(importId: string, accountId: string | null) {
  const { team } = await requireTeamRole(['owner', 'member', 'advisor', 'bookkeeper']);

  if (accountId) {
    await assertStatementAccountBelongsToTeam(team.id, accountId);
  }

  await updateStatementImport(importId, team.id, {
    linkedAccountId: accountId,
  });

  revalidatePath('/dashboard/statement-imports');
}

export async function categorizeTransaction(transactionId: string, accountId: string | null) {
  const { team } = await requireTeamRole(['owner', 'member', 'advisor', 'bookkeeper']);

  const willCategorize = Boolean(accountId);
  const hadCategorizedTransactions = willCategorize
    ? await hasAnyCategorizedTransactionsForTeam(team.id)
    : true;

  if (accountId) {
    await assertAccountsBelongToTeam(team.id, [accountId]);
  }

  // Update the transaction's confirmed account
  await updateParsedTransaction(transactionId, team.id, {
    confirmedAccountId: accountId,
  });

  // Save mapping for future imports (only if an account was selected)
  if (accountId) {
    const transaction = await getParsedTransactionById(transactionId, team.id);
    if (transaction) {
      await saveOrUpdateMapping(
        team.id,
        transaction.normalizedDescription || normalizeStatementDescription(transaction.description),
        accountId,
      );
    }
  }

  revalidatePath('/dashboard/statement-imports');

  return {
    isFirstCategorizedTransaction: willCategorize && !hadCategorizedTransactions,
  };
}

export async function toggleTransactionExcluded(transactionId: string, isExcluded: boolean) {
  const { team } = await requireTeamRole(['owner', 'member', 'advisor', 'bookkeeper']);

  await updateParsedTransaction(transactionId, team.id, {
    isExcluded,
  });

  revalidatePath('/dashboard/statement-imports');
}

export async function bulkSetTransactionsExcluded(transactionIds: string[], isExcluded: boolean) {
  if (transactionIds.length === 0) return;

  const { team } = await requireTeamRole(['owner', 'member', 'advisor', 'bookkeeper']);

  await setParsedTransactionsExcludedForUnposted(transactionIds, team.id, isExcluded);

  revalidatePath('/dashboard/statement-imports');
}

export async function updateTransactionDescription(transactionId: string, description: string) {
  const { team } = await requireTeamRole(['owner', 'member', 'advisor', 'bookkeeper']);

  const trimmed = description.trim();

  if (!trimmed) {
    throw new Error('Description cannot be empty');
  }

  await updateParsedTransaction(transactionId, team.id, {
    description: trimmed,
    normalizedDescription: normalizeStatementDescription(trimmed),
  });

  revalidatePath('/dashboard/statement-imports');
}

export async function updateTransactionAllocations(params: {
  transactionId: string;
  allocations: Array<{ accountId: string; amountCents: number }>;
}) {
  const { transactionId, allocations } = params;
  const { team } = await requireTeamRole(['owner', 'member', 'advisor', 'bookkeeper']);

  const transaction = await getParsedTransactionById(transactionId, team.id);
  if (!transaction) {
    throw new Error('Transaction not found');
  }

  const absAmountCents = Math.abs(transaction.amountCents);

  if (allocations.length === 0) {
    throw new Error('At least one allocation is required');
  }

  const sanitized = allocations
    .map((allocation) => ({
      accountId: String(allocation.accountId ?? '').trim(),
      amountCents: Number(allocation.amountCents ?? 0),
    }))
    .filter((allocation) => allocation.accountId && Number.isFinite(allocation.amountCents));

  if (sanitized.length === 0) {
    throw new Error('At least one valid allocation is required');
  }

  for (const allocation of sanitized) {
    if (!Number.isInteger(allocation.amountCents) || allocation.amountCents <= 0) {
      throw new Error('Allocation amounts must be positive cents');
    }
  }

  const totalAllocated = sanitized.reduce((sum, allocation) => sum + allocation.amountCents, 0);
  if (totalAllocated !== absAmountCents) {
    throw new Error(
      `Allocations must total ${(absAmountCents / 100).toFixed(2)} (got ${(totalAllocated / 100).toFixed(2)})`,
    );
  }

  await assertAccountsBelongToTeam(
    team.id,
    sanitized.map((allocation) => allocation.accountId),
  );

  const primaryAccountId = sanitized[0]?.accountId ?? null;
  if (!primaryAccountId) {
    throw new Error('Primary allocation account is required');
  }

  const willCategorize = true;
  const hadCategorizedTransactions = await hasAnyCategorizedTransactionsForTeam(team.id);

  await updateParsedTransaction(transactionId, team.id, {
    confirmedAccountId: primaryAccountId,
    allocations: sanitized.length > 1 ? sanitized : null,
    categoryConfidence: 'manual',
  });

  if (sanitized.length === 1) {
    await saveOrUpdateMapping(
      team.id,
      transaction.normalizedDescription || normalizeStatementDescription(transaction.description),
      primaryAccountId,
    );
  }

  revalidatePath('/dashboard/statement-imports');

  return {
    isFirstCategorizedTransaction: willCategorize && !hadCategorizedTransactions,
  };
}

export async function postTransactionsToJournal(batchOrImportId: string) {
  const { user, team } = await requireTeamRole(['owner', 'member', 'advisor', 'bookkeeper']);
  await requireActiveCoa(team.id);

  const result = await postStatementImportBatchToJournal({
    orgId: team.id,
    userId: user.id,
    batchOrImportId,
  });

  revalidatePath('/dashboard/statement-imports');
  revalidatePath(`/dashboard/statement-imports/${result.importBatchId}`);

  return { batchId: result.batchId, transactionCount: result.transactionCount };
}

export async function unpostStatementImport(batchOrImportId: string) {
  const { user, team } = await requireTeamRole(['owner', 'member', 'advisor', 'bookkeeper']);

  const result = await unpostStatementImportBatch({
    orgId: team.id,
    userId: user.id,
    batchOrImportId,
  });

  revalidatePath('/dashboard/statement-imports');
  revalidatePath(`/dashboard/statement-imports/${result.importBatchId}`);
}
