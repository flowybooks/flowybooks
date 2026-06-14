import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getStatementImportsByBatchId,
  getStatementImportById,
  getParsedTransactionsForBatch,
  getTeamForUser,
  getAccountsForTeam,
} from '@/lib/db/queries';
import { TransactionTable } from './transaction-table';
import { PostButton } from './post-button';
import { UnpostButton } from './unpost-button';
import { listAccountsForCategorization } from '../actions';
import { CategorizationAutoRefresh } from './categorization-auto-refresh';
import { ProcessingAutoRefresh } from './processing-auto-refresh';
import { getAiSetupMessage, isAiConfigured } from '@/lib/kevin/model-client';
import { ExtractButton } from './extract-button';

interface Props {
  params: Promise<{ id: string }>;
}

function formatCentsAsCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function getReconciliation(imp: unknown): {
  status?: string;
  expectedDeltaCents?: number | null;
  capturedDeltaCents?: number | null;
  diffCents?: number | null;
} | null {
  if (!imp || typeof imp !== 'object') return null;
  const maybe = imp as { sourceInfo?: unknown };
  const sourceInfo = maybe.sourceInfo;
  if (!sourceInfo || typeof sourceInfo !== 'object') return null;
  const reconciliation = (sourceInfo as { reconciliation?: unknown }).reconciliation;
  if (!reconciliation || typeof reconciliation !== 'object') return null;
  return reconciliation as {
    status?: string;
    expectedDeltaCents?: number | null;
    capturedDeltaCents?: number | null;
    diffCents?: number | null;
  };
}

function getExtractionWarnings(imp: unknown): {
  status?: string;
  issues?: Array<{
    code?: string;
    message?: string;
    details?: unknown;
  }>;
} | null {
  if (!imp || typeof imp !== 'object') return null;
  const maybe = imp as { sourceInfo?: unknown };
  const sourceInfo = maybe.sourceInfo;
  if (!sourceInfo || typeof sourceInfo !== 'object') return null;
  const extractionWarnings = (sourceInfo as { extractionWarnings?: unknown }).extractionWarnings;
  if (!extractionWarnings || typeof extractionWarnings !== 'object') return null;
  return extractionWarnings as {
    status?: string;
    issues?: Array<{
      code?: string;
      message?: string;
      details?: unknown;
    }>;
  };
}

export default async function StatementImportDetailPage({ params }: Props) {
  const { id } = await params;
  const team = await getTeamForUser();

  if (!team) {
    return (
      <div className="p-6">
        <div className="p-4 border rounded-md bg-muted/50 text-muted-foreground">
          Please create or select an organization.
        </div>
      </div>
    );
  }

  // Try batch lookup first, then fallback to single import (backward compat)
  let batchImports = await getStatementImportsByBatchId(id, team.id);
  let isBatchView = batchImports.length > 0;

  if (!isBatchView) {
    // Fallback: maybe `id` is an old import ID
    const singleImport = await getStatementImportById(id, team.id);
    if (!singleImport) {
      notFound();
    }
    // Use that import's batchId to get the full batch
    batchImports = await getStatementImportsByBatchId(singleImport.importBatchId, team.id);
    if (batchImports.length === 0) {
      batchImports = [singleImport];
    }
    isBatchView = true;
  }

  const primaryImport = batchImports[0]!;
  const batchId = primaryImport.importBatchId;
  const linkedAccountId = primaryImport.linkedAccountId;

  const [allTransactions, categoryAccounts, allAccounts] = await Promise.all([
    getParsedTransactionsForBatch(batchId, team.id),
    listAccountsForCategorization(),
    getAccountsForTeam(team.id),
  ]);

  // Derive batch-level statuses
  const statuses = batchImports.map((imp) => imp.status);
  const aiEnabled = isAiConfigured();
  const isProcessing = statuses.some((s) =>
    aiEnabled ? s === 'uploaded' || s === 'extracting' : s === 'extracting',
  );
  const firstUploadedImportId = batchImports.find((imp) => imp.status === 'uploaded')?.id ?? null;
  const hasUploadedPdf = firstUploadedImportId !== null;
  const isAllImported = statuses.every((s) => s === 'imported');
  const hasFailed = statuses.some((s) => s === 'failed');

  // Find linked account name
  const accountLabels = new Map(allAccounts.map((a) => [a.id, `${a.code} - ${a.name}`]));
  const linkedAccountLabel = linkedAccountId
    ? (accountLabels.get(linkedAccountId) ?? 'Linked account')
    : null;

  // Date range across all imports
  const allStartDates = batchImports.map((imp) => imp.statementStartDate).filter(Boolean) as Date[];
  const allEndDates = batchImports.map((imp) => imp.statementEndDate).filter(Boolean) as Date[];
  const earliestDate =
    allStartDates.length > 0 ? allStartDates.reduce((a, b) => (a < b ? a : b)) : null;
  const latestDate = allEndDates.length > 0 ? allEndDates.reduce((a, b) => (a > b ? a : b)) : null;

  // Transaction counts
  const categorizedCount = allTransactions.filter(
    (t) => t.confirmedAccountId && !t.isExcluded,
  ).length;
  const uncategorizedCount = allTransactions.filter(
    (t) => !t.isExcluded && !t.confirmedAccountId,
  ).length;
  const postedCount = allTransactions.filter((t) => t.journalBatchId).length;
  const postableCount = allTransactions.filter(
    (t) => t.confirmedAccountId && !t.isExcluded && !t.journalBatchId,
  ).length;
  const activeCount = allTransactions.filter((t) => !t.isExcluded).length;

  const canPost = !!linkedAccountId && postableCount > 0;

  // Statement type
  const statementType = primaryImport.statementType;

  // Batch title: account name + date
  const batchDate = primaryImport.createdAt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const batchTitle = linkedAccountLabel ? `${linkedAccountLabel.split(' - ').pop()}` : 'Import';

  // Error messages
  const errorMessages = batchImports
    .filter((imp) => imp.errorMessage)
    .map((imp) => `${imp.fileName}: ${imp.errorMessage}`);

  const reconciliationWarnings = batchImports
    .map((imp) => {
      const reconciliation = getReconciliation(imp);
      return reconciliation?.status === 'warning' ? { imp, reconciliation } : null;
    })
    .filter(Boolean) as Array<{
    imp: (typeof batchImports)[number];
    reconciliation: NonNullable<ReturnType<typeof getReconciliation>>;
  }>;

  const extractionWarnings = batchImports
    .map((imp) => {
      const warnings = getExtractionWarnings(imp);
      return warnings?.status === 'warning' ? { imp, warnings } : null;
    })
    .filter(Boolean) as Array<{
    imp: (typeof batchImports)[number];
    warnings: NonNullable<ReturnType<typeof getExtractionWarnings>>;
  }>;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <CategorizationAutoRefresh enabled={!isProcessing && uncategorizedCount > 0} />
      <ProcessingAutoRefresh enabled={isProcessing} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/statement-imports"
            className="text-sm text-muted-foreground hover:underline"
          >
            &larr; Back to bank imports
          </Link>
          <h1 className="text-2xl font-bold tracking-tight mt-1">
            {batchTitle} &middot; {batchDate}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {isProcessing && <span className="text-sm text-muted-foreground">Processing...</span>}
          {firstUploadedImportId && aiEnabled ? (
            <ExtractButton importId={firstUploadedImportId} />
          ) : null}
        </div>
      </div>

      {/* Info card */}
      <div className="border rounded-md p-4 bg-card space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-muted-foreground">Account:</span>{' '}
            <span className="font-medium">{linkedAccountLabel ?? '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Type:</span>{' '}
            <span className="font-medium">
              {statementType === 'credit_card_statement'
                ? 'Credit Card'
                : statementType === 'bank_statement'
                  ? 'Bank Statement'
                  : (statementType ?? '—')}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Files:</span>{' '}
            <span className="font-medium">{batchImports.length}</span>
          </div>
          {earliestDate && latestDate && (
            <div>
              <span className="text-muted-foreground">Period:</span>{' '}
              <span className="font-medium">
                {earliestDate.toLocaleDateString()} – {latestDate.toLocaleDateString()}
              </span>
            </div>
          )}
        </div>

        {extractionWarnings.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <div className="font-medium">Extraction warning</div>
            <div className="text-amber-800">
              Some statement metadata or extracted transactions need review. Import is allowed.
            </div>
            <div className="mt-2 space-y-1">
              {extractionWarnings.map(({ imp, warnings }) => {
                const issues = Array.isArray(warnings.issues) ? warnings.issues : [];
                const outOfPeriod = issues.find(
                  (issue) => issue?.code === 'out_of_period_transactions',
                );
                const outCount =
                  outOfPeriod &&
                  outOfPeriod.details &&
                  typeof outOfPeriod.details === 'object' &&
                  typeof (outOfPeriod.details as { transactionCount?: unknown })
                    .transactionCount === 'number'
                    ? ((outOfPeriod.details as { transactionCount?: number }).transactionCount ?? 0)
                    : null;

                return (
                  <div key={imp.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-medium">{imp.fileName}</span>
                    {outCount !== null ? (
                      <span className="text-amber-800">{outCount} out-of-period</span>
                    ) : (
                      <span className="text-amber-800">
                        {issues.length} issue{issues.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {reconciliationWarnings.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <div className="font-medium">Reconciliation warning</div>
            <div className="text-amber-800">
              Extracted activity does not reconcile to the statement’s beginning/ending balances.
              Import is allowed, but review is recommended.
            </div>
            <div className="mt-2 space-y-1">
              {reconciliationWarnings.map(({ imp, reconciliation }) => (
                <div key={imp.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-medium">{imp.fileName}</span>
                  {typeof reconciliation.diffCents === 'number' ? (
                    <span className="text-amber-800">
                      diff {formatCentsAsCurrency(reconciliation.diffCents)}
                    </span>
                  ) : null}
                  {typeof reconciliation.expectedDeltaCents === 'number' &&
                  typeof reconciliation.capturedDeltaCents === 'number' ? (
                    <span className="text-amber-800">
                      (expected {formatCentsAsCurrency(reconciliation.expectedDeltaCents)}, captured{' '}
                      {formatCentsAsCurrency(reconciliation.capturedDeltaCents)})
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Collapsible files list */}
        {batchImports.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              View uploaded files
            </summary>
            <div className="mt-2 space-y-1 pl-2 border-l-2 border-muted">
              {batchImports.map((imp) => (
                <div key={imp.id} className="flex items-center gap-2">
                  <span className="font-medium">{imp.fileName}</span>
                  <span className="text-muted-foreground">
                    {(imp.fileSize / 1024).toFixed(1)} KB
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[0.6rem] font-medium ring-1 ring-inset ${
                      imp.status === 'imported'
                        ? 'bg-green-50 text-green-700 ring-green-600/20'
                        : imp.status === 'failed'
                          ? 'bg-red-50 text-red-700 ring-red-600/20'
                          : imp.status === 'extracting' || imp.status === 'uploaded'
                            ? 'bg-blue-50 text-blue-700 ring-blue-600/20'
                            : 'bg-gray-50 text-gray-600 ring-gray-500/10'
                    }`}
                  >
                    {imp.status}
                  </span>
                  {(() => {
                    const reconciliation = getReconciliation(imp);
                    return reconciliation?.status === 'warning' &&
                      typeof reconciliation.diffCents === 'number' ? (
                      <span className="text-[0.65rem] text-amber-700">
                        reconcile diff {formatCentsAsCurrency(reconciliation.diffCents)}
                      </span>
                    ) : null;
                  })()}
                </div>
              ))}
            </div>
          </details>
        )}

        {statementType === 'credit_card_statement' && (
          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            Tip: For credit card payments, you usually also import the matching cash/bank statement.
            To avoid double-counting cash, categorize payments to the credit card account (or leave
            them uncategorized/excluded) and categorize charges/refunds to the appropriate
            income/expense accounts.
          </div>
        )}

        {errorMessages.length > 0 && (
          <div className="p-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded space-y-1">
            {errorMessages.map((msg, i) => (
              <div key={i}>{msg}</div>
            ))}
          </div>
        )}

        {hasUploadedPdf && !aiEnabled ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {getAiSetupMessage()} CSV imports and manual categorization still work.
          </div>
        ) : null}
      </div>

      {/* Transactions */}
      {allTransactions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">
              Transactions ({activeCount} active, {categorizedCount} categorized, {postedCount}{' '}
              posted)
            </h2>
            <div className="flex items-center gap-2">
              {postedCount > 0 && <UnpostButton importId={batchId} postedCount={postedCount} />}
              {!isAllImported && (
                <PostButton importId={batchId} canPost={canPost} postableCount={postableCount} />
              )}
              {isAllImported && (
                <span className="text-sm text-green-600 font-medium">Posted to Journal</span>
              )}
            </div>
          </div>
          <TransactionTable
            transactions={allTransactions}
            accounts={categoryAccounts}
            groupByMonth
            defaultView={uncategorizedCount > 0 ? 'uncategorized' : 'all'}
          />
        </div>
      )}

      {allTransactions.length === 0 && isProcessing && (
        <div className="text-center py-8 text-muted-foreground">
          Extracting transactions... this page will update automatically.
        </div>
      )}

      {allTransactions.length === 0 && !isProcessing && !hasFailed && (
        <div className="text-center py-8 text-muted-foreground">
          No transactions found in this import.
        </div>
      )}
    </div>
  );
}
