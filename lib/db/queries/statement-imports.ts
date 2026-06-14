// This file handles bank-import records, parsed transactions, and
// auto-categorization mapping rules. It powers the bank import list,
// detail pages, and saved description-to-account matching logic.

import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, ne, sql } from 'drizzle-orm';

import { db } from '../drizzle';
import {
  accountMappingRules,
  parsedTransactions,
  statementImports,
  type NewParsedTransaction,
  type NewStatementImport,
  type ParsedTransactionAllocation,
  type StatementImport,
} from '../schema';

export async function createStatementImport(data: NewStatementImport): Promise<StatementImport> {
  const [result] = await db.insert(statementImports).values(data).returning();
  if (!result) {
    throw new Error('Unable to create statement import.');
  }
  return result;
}

export async function getStatementImportsForTeam(teamId: number) {
  return await db
    .select({
      id: statementImports.id,
      importBatchId: statementImports.importBatchId,
      fileName: statementImports.fileName,
      fileSize: statementImports.fileSize,
      fileChecksum: statementImports.fileChecksum,
      status: statementImports.status,
      statementType: statementImports.statementType,
      institutionName: statementImports.institutionName,
      accountNumber: statementImports.accountNumber,
      statementStartDate: statementImports.statementStartDate,
      statementEndDate: statementImports.statementEndDate,
      linkedAccountId: statementImports.linkedAccountId,
      createdAt: statementImports.createdAt,
      updatedAt: statementImports.updatedAt,
    })
    .from(statementImports)
    .where(eq(statementImports.orgId, teamId))
    .orderBy(desc(statementImports.createdAt));
}

export async function getStatementImportsByBatchId(batchId: string, teamId: number) {
  return await db
    .select()
    .from(statementImports)
    .where(and(eq(statementImports.importBatchId, batchId), eq(statementImports.orgId, teamId)))
    .orderBy(asc(statementImports.createdAt));
}

export async function getParsedTransactionsForBatch(batchId: string, teamId: number) {
  const imports = await db
    .select({ id: statementImports.id })
    .from(statementImports)
    .where(and(eq(statementImports.importBatchId, batchId), eq(statementImports.orgId, teamId)));

  const importIds = imports.map((statementImport) => statementImport.id);
  if (importIds.length === 0) {
    return [];
  }

  return await db
    .select({
      id: parsedTransactions.id,
      statementImportId: parsedTransactions.statementImportId,
      lineNumber: parsedTransactions.lineNumber,
      transactionDate: parsedTransactions.transactionDate,
      description: parsedTransactions.description,
      rawDescription: parsedTransactions.rawDescription,
      normalizedDescription: parsedTransactions.normalizedDescription,
      amountCents: parsedTransactions.amountCents,
      checkNumber: parsedTransactions.checkNumber,
      suggestedAccountId: parsedTransactions.suggestedAccountId,
      categoryConfidence: parsedTransactions.categoryConfidence,
      confirmedAccountId: parsedTransactions.confirmedAccountId,
      allocations: parsedTransactions.allocations,
      isExcluded: parsedTransactions.isExcluded,
      journalBatchId: parsedTransactions.journalBatchId,
    })
    .from(parsedTransactions)
    .where(
      and(
        inArray(parsedTransactions.statementImportId, importIds),
        eq(parsedTransactions.orgId, teamId),
      ),
    )
    .orderBy(asc(parsedTransactions.transactionDate), asc(parsedTransactions.lineNumber));
}

export async function getParsedTransactionBatchRowsForImports(
  teamId: number,
  imports: Awaited<ReturnType<typeof getStatementImportsForTeam>>,
) {
  if (imports.length === 0) {
    return [];
  }

  return await db
    .select({
      id: parsedTransactions.id,
      statementImportId: parsedTransactions.statementImportId,
      confirmedAccountId: parsedTransactions.confirmedAccountId,
      isExcluded: parsedTransactions.isExcluded,
      journalBatchId: parsedTransactions.journalBatchId,
    })
    .from(parsedTransactions)
    .where(
      and(
        inArray(
          parsedTransactions.statementImportId,
          imports.map((imp) => imp.id),
        ),
        eq(parsedTransactions.orgId, teamId),
      ),
    );
}

export async function getStatementImportById(id: string, teamId: number) {
  const [row] = await db
    .select()
    .from(statementImports)
    .where(and(eq(statementImports.id, id), eq(statementImports.orgId, teamId)))
    .limit(1);
  return row ?? null;
}

export async function deleteStatementImport(id: string, teamId: number) {
  await db
    .delete(statementImports)
    .where(and(eq(statementImports.id, id), eq(statementImports.orgId, teamId)));
}

export async function updateStatementImport(
  id: string,
  teamId: number,
  data: Partial<{
    status:
      | 'uploaded'
      | 'extracting'
      | 'extracted'
      | 'reviewing'
      | 'approved'
      | 'imported'
      | 'failed';
    statementType:
      | 'bank_statement'
      | 'credit_card_statement'
      | 'sba_loan'
      | 'factoring_loan'
      | 'secured_loan'
      | 'auto_loan'
      | 'lease'
      | undefined;
    institutionName: string | undefined;
    accountNumber: string | null | undefined;
    statementStartDate: Date | undefined;
    statementEndDate: Date | undefined;
    beginningBalanceCents: number | null | undefined;
    endingBalanceCents: number | null | undefined;
    extractionModel: string | undefined;
    errorMessage: string | undefined;
    linkedAccountId: string | null | undefined;
    sourceText: string | undefined;
    sourceInfo: unknown | undefined;
  }>,
) {
  await db
    .update(statementImports)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(statementImports.id, id), eq(statementImports.orgId, teamId)));
}

export async function purgeStatementImportSourceText(
  statementImportId: string,
  teamId: number,
): Promise<boolean> {
  const rows = await db
    .update(statementImports)
    .set({ sourceText: '', updatedAt: new Date() })
    .where(and(eq(statementImports.id, statementImportId), eq(statementImports.orgId, teamId)))
    .returning({ id: statementImports.id });

  return rows.length > 0;
}

export async function purgeStatementImportSourceTextOlderThan(params: {
  days: number;
}): Promise<{ purgedCount: number; cutoff: Date }> {
  const cutoff = new Date(Date.now() - params.days * 24 * 60 * 60 * 1000);

  const purgedRows = await db
    .update(statementImports)
    .set({ sourceText: '', updatedAt: new Date() })
    .where(
      and(
        lte(statementImports.createdAt, cutoff),
        ne(statementImports.status, 'extracting'),
        sql`${statementImports.sourceText} <> ''`,
      ),
    )
    .returning({ id: statementImports.id });

  return { purgedCount: purgedRows.length, cutoff };
}

export async function createParsedTransactions(transactions: NewParsedTransaction[]) {
  if (transactions.length === 0) {
    return [];
  }
  return await db.insert(parsedTransactions).values(transactions).returning();
}

export async function getParsedTransactionsForImport(statementImportId: string, teamId: number) {
  return await db
    .select({
      id: parsedTransactions.id,
      lineNumber: parsedTransactions.lineNumber,
      transactionDate: parsedTransactions.transactionDate,
      description: parsedTransactions.description,
      rawDescription: parsedTransactions.rawDescription,
      normalizedDescription: parsedTransactions.normalizedDescription,
      amountCents: parsedTransactions.amountCents,
      checkNumber: parsedTransactions.checkNumber,
      suggestedAccountId: parsedTransactions.suggestedAccountId,
      categoryConfidence: parsedTransactions.categoryConfidence,
      confirmedAccountId: parsedTransactions.confirmedAccountId,
      allocations: parsedTransactions.allocations,
      isExcluded: parsedTransactions.isExcluded,
      journalBatchId: parsedTransactions.journalBatchId,
    })
    .from(parsedTransactions)
    .where(
      and(
        eq(parsedTransactions.statementImportId, statementImportId),
        eq(parsedTransactions.orgId, teamId),
      ),
    )
    .orderBy(parsedTransactions.lineNumber);
}

export async function getParsedTransactionById(transactionId: string, teamId: number) {
  const [row] = await db
    .select()
    .from(parsedTransactions)
    .where(and(eq(parsedTransactions.id, transactionId), eq(parsedTransactions.orgId, teamId)))
    .limit(1);
  return row ?? null;
}

export async function updateParsedTransaction(
  transactionId: string,
  teamId: number,
  data: Partial<{
    description: string;
    normalizedDescription: string;
    suggestedAccountId: string | null;
    confirmedAccountId: string | null;
    allocations: ParsedTransactionAllocation[] | null;
    categoryConfidence: 'high' | 'medium' | 'low' | 'manual';
    suggestedCategoryReason: string | null;
    isExcluded: boolean;
    journalBatchId: string | null;
  }>,
) {
  return await db
    .update(parsedTransactions)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(parsedTransactions.id, transactionId), eq(parsedTransactions.orgId, teamId)))
    .returning();
}

export async function setParsedTransactionsExcludedForUnposted(
  transactionIds: string[],
  teamId: number,
  isExcluded: boolean,
) {
  if (transactionIds.length === 0) {
    return [];
  }

  return await db
    .update(parsedTransactions)
    .set({ isExcluded, updatedAt: new Date() })
    .where(
      and(
        inArray(parsedTransactions.id, transactionIds),
        eq(parsedTransactions.orgId, teamId),
        isNull(parsedTransactions.journalBatchId),
      ),
    )
    .returning({ id: parsedTransactions.id });
}

export async function hasAnyCategorizedTransactionsForTeam(teamId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: parsedTransactions.id })
    .from(parsedTransactions)
    .where(
      and(eq(parsedTransactions.orgId, teamId), isNotNull(parsedTransactions.confirmedAccountId)),
    )
    .limit(1);

  return Boolean(row);
}

export async function findMappingByDescription(orgId: number, description: string) {
  const result = await db
    .select()
    .from(accountMappingRules)
    .where(
      and(
        eq(accountMappingRules.orgId, orgId),
        eq(accountMappingRules.descriptionPattern, description),
      ),
    )
    .limit(1);
  return result[0] ?? null;
}

export async function findMappingsByDescriptions(orgId: number, descriptions: string[]) {
  const uniqueDescriptions = Array.from(
    new Set(descriptions.map((description) => description.trim()).filter(Boolean)),
  );

  if (uniqueDescriptions.length === 0) {
    return [];
  }

  return await db
    .select()
    .from(accountMappingRules)
    .where(
      and(
        eq(accountMappingRules.orgId, orgId),
        inArray(accountMappingRules.descriptionPattern, uniqueDescriptions),
      ),
    );
}

export async function saveOrUpdateMapping(
  orgId: number,
  description: string,
  accountId: string,
  userId?: number,
) {
  const existing = await findMappingByDescription(orgId, description);

  if (existing) {
    const updated = await db
      .update(accountMappingRules)
      .set({
        accountId,
        timesUsed: existing.timesUsed + 1,
        updatedAt: new Date(),
      })
      .where(eq(accountMappingRules.id, existing.id))
      .returning();
    return updated[0];
  }

  const created = await db
    .insert(accountMappingRules)
    .values({
      orgId,
      descriptionPattern: description,
      accountId,
      createdBy: userId,
    })
    .returning();
  return created[0];
}
