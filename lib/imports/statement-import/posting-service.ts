import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { accounts, auditLog, parsedTransactions, statementImports } from '@/lib/db/schema';
import {
  createPostedJournalBatchTx,
  voidJournalEntryLifecycleTx,
  type CreateJournalLineInput,
} from '@/lib/accounting/journal-service';

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type StatementImportBatchRow = {
  id: string;
  importBatchId: string;
  linkedAccountId: string | null;
  statementType: string | null;
  statementEndDate: Date | null;
  fileName: string;
  status: (typeof statementImports.$inferSelect)['status'];
};

type ParsedTransactionRow = {
  id: string;
  transactionDate: Date;
  description: string;
  rawDescription: string;
  amountCents: number;
  confirmedAccountId: string | null;
  allocations: Array<{
    accountId: string;
    amountCents: number;
  }> | null;
  isExcluded: boolean;
  journalBatchId: string | null;
};

function truncateLabel(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function buildStatementImportJournalDescription(fileNames: string[]): string {
  const normalizedNames = fileNames.map((name) => name.trim()).filter((name) => name.length > 0);

  if (normalizedNames.length === 0) {
    return 'Statement import';
  }

  if (normalizedNames.length === 1) {
    return `Statement import: ${truncateLabel(normalizedNames[0]!, 90)}`;
  }

  const firstFile = truncateLabel(normalizedNames[0]!, 60);
  return `Statement import (${normalizedNames.length} files): ${firstFile} +${normalizedNames.length - 1} more`;
}

function buildStatementImportLineSourceRef(params: {
  importBatchId: string;
  transactionId: string;
  transactionSequence: number;
  lineSequence: number;
}): Record<string, number | string> {
  return {
    kind: 'statement_import_line',
    importBatchId: params.importBatchId,
    transactionId: params.transactionId,
    transactionSequence: params.transactionSequence,
    lineSequence: params.lineSequence,
  };
}

async function resolveStatementImportBatchTx(
  tx: DbTx,
  orgId: number,
  batchOrImportId: string,
): Promise<{ importBatchId: string; imports: StatementImportBatchRow[] }> {
  let batchImports = await tx
    .select({
      id: statementImports.id,
      importBatchId: statementImports.importBatchId,
      linkedAccountId: statementImports.linkedAccountId,
      statementType: statementImports.statementType,
      statementEndDate: statementImports.statementEndDate,
      fileName: statementImports.fileName,
      status: statementImports.status,
    })
    .from(statementImports)
    .where(
      and(eq(statementImports.orgId, orgId), eq(statementImports.importBatchId, batchOrImportId)),
    );

  if (batchImports.length > 0) {
    return { importBatchId: batchImports[0]!.importBatchId, imports: batchImports };
  }

  const singleImportRows = await tx
    .select({
      id: statementImports.id,
      importBatchId: statementImports.importBatchId,
      linkedAccountId: statementImports.linkedAccountId,
      statementType: statementImports.statementType,
      statementEndDate: statementImports.statementEndDate,
      fileName: statementImports.fileName,
      status: statementImports.status,
    })
    .from(statementImports)
    .where(and(eq(statementImports.orgId, orgId), eq(statementImports.id, batchOrImportId)))
    .limit(1);

  const singleImport = singleImportRows[0];
  if (!singleImport) {
    throw new Error('Statement import not found');
  }

  batchImports = await tx
    .select({
      id: statementImports.id,
      importBatchId: statementImports.importBatchId,
      linkedAccountId: statementImports.linkedAccountId,
      statementType: statementImports.statementType,
      statementEndDate: statementImports.statementEndDate,
      fileName: statementImports.fileName,
      status: statementImports.status,
    })
    .from(statementImports)
    .where(
      and(
        eq(statementImports.orgId, orgId),
        eq(statementImports.importBatchId, singleImport.importBatchId),
      ),
    );

  if (batchImports.length === 0) {
    batchImports = [singleImport];
  }

  return { importBatchId: singleImport.importBatchId, imports: batchImports };
}

async function loadParsedTransactionsForImportsTx(
  tx: DbTx,
  orgId: number,
  statementImportIds: string[],
): Promise<ParsedTransactionRow[]> {
  if (statementImportIds.length === 0) {
    return [];
  }

  const rows = await tx
    .select({
      id: parsedTransactions.id,
      transactionDate: parsedTransactions.transactionDate,
      description: parsedTransactions.description,
      rawDescription: parsedTransactions.rawDescription,
      amountCents: parsedTransactions.amountCents,
      confirmedAccountId: parsedTransactions.confirmedAccountId,
      allocations: parsedTransactions.allocations,
      isExcluded: parsedTransactions.isExcluded,
      journalBatchId: parsedTransactions.journalBatchId,
    })
    .from(parsedTransactions)
    .where(
      and(
        eq(parsedTransactions.orgId, orgId),
        inArray(parsedTransactions.statementImportId, statementImportIds),
      ),
    );

  return rows.map((row) => ({
    ...row,
    amountCents: Number(row.amountCents),
  }));
}

function looksLikeCardPayment(description: string, rawDescription: string): boolean {
  const PAYMENT_KEYWORDS = ['payment', 'pmt', 'paid', 'paymt', 'bill pay', 'autopay', 'auto pay'];
  const haystack = `${description} ${rawDescription}`.toLowerCase();
  return PAYMENT_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

function pickBatchDate(batchImports: StatementImportBatchRow[]): Date {
  const endDates = batchImports.map((imp) => imp.statementEndDate).filter(Boolean) as Date[];

  if (endDates.length === 0) {
    return new Date();
  }

  return endDates.reduce((a, b) => (a > b ? a : b));
}

export type PostStatementImportBatchToJournalResult = {
  importBatchId: string;
  batchId: string | null;
  transactionCount: number;
};

export async function postStatementImportBatchToJournalTx(params: {
  tx: DbTx;
  orgId: number;
  userId: number;
  batchOrImportId: string;
}): Promise<PostStatementImportBatchToJournalResult> {
  const { tx, orgId, batchOrImportId } = params;

  const { importBatchId, imports: batchImports } = await resolveStatementImportBatchTx(
    tx,
    orgId,
    batchOrImportId,
  );

  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`statement_import_batch:${importBatchId}`})::bigint)`,
  );

  const primaryImport = batchImports[0]!;
  const linkedAccountId = primaryImport.linkedAccountId;
  if (!linkedAccountId) {
    throw new Error('Please select a statement account before posting');
  }

  for (const imp of batchImports) {
    if (imp.linkedAccountId !== linkedAccountId) {
      throw new Error('All imports in the batch must share the same linked account');
    }
  }

  const accountRows = await tx
    .select({
      id: accounts.id,
      type: accounts.type,
      isStatementAccount: accounts.isStatementAccount,
    })
    .from(accounts)
    .where(eq(accounts.orgId, orgId));
  const accountById = new Map(accountRows.map((account) => [account.id, account]));
  const linkedAccount = accountById.get(linkedAccountId);
  if (!linkedAccount) {
    throw new Error('Selected statement account was not found');
  }

  const isCreditCardStatement =
    primaryImport.statementType === 'credit_card_statement' && linkedAccount.type === 'liability';

  const statementImportIds = batchImports.map((imp) => imp.id);
  const transactions = await loadParsedTransactionsForImportsTx(tx, orgId, statementImportIds);

  const transactionsToPost = transactions.filter(
    (t) => t.confirmedAccountId && !t.isExcluded && !t.journalBatchId,
  );

  if (transactionsToPost.length === 0) {
    const remainingActiveUnpostedCount = transactions.filter(
      (t) => !t.isExcluded && !t.journalBatchId,
    ).length;
    if (remainingActiveUnpostedCount === 0) {
      const now = new Date();
      await tx
        .update(statementImports)
        .set({ status: 'imported', updatedAt: now })
        .where(
          and(eq(statementImports.orgId, orgId), eq(statementImports.importBatchId, importBatchId)),
        );

      return { importBatchId, batchId: null, transactionCount: 0 };
    }

    throw new Error('No newly categorized transactions to post');
  }

  const journalLines = transactionsToPost.flatMap((statementTx, transactionSequence) => {
    const absAmountCents = Math.abs(statementTx.amountCents);
    const isDeposit = statementTx.amountCents > 0;

    if (isDeposit) {
      let allocations =
        statementTx.allocations && statementTx.allocations.length > 0
          ? statementTx.allocations
          : [{ accountId: statementTx.confirmedAccountId!, amountCents: absAmountCents }];

      if (
        isCreditCardStatement &&
        looksLikeCardPayment(statementTx.description, statementTx.rawDescription) &&
        allocations.some((allocation) => {
          const account = accountById.get(allocation.accountId);
          return account?.type === 'asset' && account.isStatementAccount;
        })
      ) {
        allocations = [{ accountId: linkedAccountId, amountCents: absAmountCents }];
      }

      const totalAllocated = allocations.reduce(
        (sum, allocation) => sum + allocation.amountCents,
        0,
      );
      if (totalAllocated !== absAmountCents) {
        throw new Error(
          `Transaction allocations must total ${(absAmountCents / 100).toFixed(2)} for "${statementTx.description}"`,
        );
      }

      return [
        {
          accountId: linkedAccountId,
          glDate: statementTx.transactionDate,
          debit: absAmountCents,
          credit: 0,
          narration: statementTx.description,
          sourceType: 'statement_import_line',
          sourceRef: buildStatementImportLineSourceRef({
            importBatchId,
            transactionId: statementTx.id,
            transactionSequence,
            lineSequence: 0,
          }),
        },
        ...allocations.map((allocation, allocationIndex) => ({
          accountId: allocation.accountId,
          glDate: statementTx.transactionDate,
          debit: 0,
          credit: allocation.amountCents,
          narration: statementTx.description,
          sourceType: 'statement_import_line',
          sourceRef: buildStatementImportLineSourceRef({
            importBatchId,
            transactionId: statementTx.id,
            transactionSequence,
            lineSequence: allocationIndex + 1,
          }),
        })),
      ] satisfies CreateJournalLineInput[];
    }

    const allocations =
      statementTx.allocations && statementTx.allocations.length > 0
        ? statementTx.allocations
        : [{ accountId: statementTx.confirmedAccountId!, amountCents: absAmountCents }];

    const totalAllocated = allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0);
    if (totalAllocated !== absAmountCents) {
      throw new Error(
        `Transaction allocations must total ${(absAmountCents / 100).toFixed(2)} for "${statementTx.description}"`,
      );
    }

    return [
      {
        accountId: linkedAccountId,
        glDate: statementTx.transactionDate,
        debit: 0,
        credit: absAmountCents,
        narration: statementTx.description,
        sourceType: 'statement_import_line',
        sourceRef: buildStatementImportLineSourceRef({
          importBatchId,
          transactionId: statementTx.id,
          transactionSequence,
          lineSequence: 0,
        }),
      },
      ...allocations.map((allocation, allocationIndex) => ({
        accountId: allocation.accountId,
        glDate: statementTx.transactionDate,
        debit: allocation.amountCents,
        credit: 0,
        narration: statementTx.description,
        sourceType: 'statement_import_line',
        sourceRef: buildStatementImportLineSourceRef({
          importBatchId,
          transactionId: statementTx.id,
          transactionSequence,
          lineSequence: allocationIndex + 1,
        }),
      })),
    ] satisfies CreateJournalLineInput[];
  });

  const batchDate = pickBatchDate(batchImports);
  const fileNames = batchImports.map((imp) => imp.fileName);

  const transactionIds = transactionsToPost.map((t) => t.id).sort();

  const { batchId: journalBatchId } = await createPostedJournalBatchTx(
    tx,
    {
      orgId,
      date: batchDate,
      description: buildStatementImportJournalDescription(fileNames),
      lines: journalLines,
    },
    {
      sourceType: 'statement_import_post',
      sourceRef: {
        importBatchId,
        transactionIds,
      },
    },
  );

  const now = new Date();
  const updatedTransactions = await tx
    .update(parsedTransactions)
    .set({ journalBatchId: journalBatchId, updatedAt: now })
    .where(and(eq(parsedTransactions.orgId, orgId), inArray(parsedTransactions.id, transactionIds)))
    .returning({ id: parsedTransactions.id });

  if (updatedTransactions.length !== transactionIds.length) {
    throw new Error('Unable to mark all statement transactions as posted');
  }

  const postedNowIds = new Set(transactionIds);
  const remainingActiveCount = transactions.filter(
    (t) => !t.isExcluded && !t.journalBatchId && !postedNowIds.has(t.id),
  ).length;

  if (remainingActiveCount === 0) {
    await tx
      .update(statementImports)
      .set({ status: 'imported', updatedAt: now })
      .where(
        and(eq(statementImports.orgId, orgId), eq(statementImports.importBatchId, importBatchId)),
      );
  }

  return { importBatchId, batchId: journalBatchId, transactionCount: transactionIds.length };
}

export async function postStatementImportBatchToJournal(params: {
  orgId: number;
  userId: number;
  batchOrImportId: string;
}): Promise<PostStatementImportBatchToJournalResult> {
  return db.transaction((tx) => postStatementImportBatchToJournalTx({ tx, ...params }));
}

export type UnpostStatementImportBatchResult = {
  importBatchId: string;
  voidedBatchCount: number;
  transactionCount: number;
};

export async function unpostStatementImportBatchTx(params: {
  tx: DbTx;
  orgId: number;
  userId: number;
  batchOrImportId: string;
}): Promise<UnpostStatementImportBatchResult> {
  const { tx, orgId, userId, batchOrImportId } = params;

  const { importBatchId, imports: batchImports } = await resolveStatementImportBatchTx(
    tx,
    orgId,
    batchOrImportId,
  );

  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`statement_import_batch:${importBatchId}`})::bigint)`,
  );

  const statementImportIds = batchImports.map((imp) => imp.id);
  const transactions = await loadParsedTransactionsForImportsTx(tx, orgId, statementImportIds);
  const postedTransactions = transactions.filter((t) => t.journalBatchId);

  if (postedTransactions.length === 0) {
    return { importBatchId, voidedBatchCount: 0, transactionCount: 0 };
  }

  const journalBatchIds = Array.from(
    new Set(postedTransactions.map((t) => t.journalBatchId).filter(Boolean) as string[]),
  );

  for (const journalBatchId of journalBatchIds) {
    await voidJournalEntryLifecycleTx(tx, {
      orgId,
      batchId: journalBatchId,
      voidedByUserId: userId,
      createAudit: false,
    });

    await tx.insert(auditLog).values({
      orgId,
      userId,
      entityType: 'journal_batch',
      entityId: journalBatchId,
      action: 'unpost',
      previousState: null,
      newState: {
        status: 'voided',
        source: 'statement_import',
        importBatchId,
      },
      changeReason: 'Unposted statement import batch',
      timestamp: new Date(),
      source: 'web_ui',
      success: true,
      errorMessage: null,
      ipAddress: null,
      userAgent: null,
      sessionId: null,
    });
  }

  const now = new Date();
  const postedTransactionIds = postedTransactions.map((t) => t.id);

  await tx
    .update(parsedTransactions)
    .set({ journalBatchId: null, updatedAt: now })
    .where(
      and(
        eq(parsedTransactions.orgId, orgId),
        inArray(parsedTransactions.id, postedTransactionIds),
      ),
    );

  await tx
    .update(statementImports)
    .set({ status: 'extracted', updatedAt: now })
    .where(
      and(
        eq(statementImports.orgId, orgId),
        eq(statementImports.importBatchId, importBatchId),
        eq(statementImports.status, 'imported'),
      ),
    );

  return {
    importBatchId,
    voidedBatchCount: journalBatchIds.length,
    transactionCount: postedTransactionIds.length,
  };
}

export async function unpostStatementImportBatch(params: {
  orgId: number;
  userId: number;
  batchOrImportId: string;
}): Promise<UnpostStatementImportBatchResult> {
  return db.transaction((tx) => unpostStatementImportBatchTx({ tx, ...params }));
}
