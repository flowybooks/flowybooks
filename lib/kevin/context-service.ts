import { and, desc, eq, ilike, sql } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import {
  accounts,
  journalBatches,
  kevinDocumentChunks,
  kevinDocuments,
  kevinMemories,
  parsedTransactions,
  statementImports,
} from '@/lib/db/schema';

import { centsToDisplay, truncate } from './format';

export async function getAccountsForKevin(orgId: number) {
  return db
    .select({
      id: accounts.id,
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      classification: accounts.classification,
      isActive: accounts.isActive,
    })
    .from(accounts)
    .where(eq(accounts.orgId, orgId))
    .orderBy(accounts.code);
}

export type KevinAccountContext = Awaited<ReturnType<typeof getAccountsForKevin>>;

export async function getRecentJournalContext(orgId: number) {
  const rows = await db
    .select({
      id: journalBatches.id,
      date: journalBatches.date,
      description: journalBatches.description,
      status: journalBatches.status,
      updatedAt: journalBatches.updatedAt,
    })
    .from(journalBatches)
    .where(eq(journalBatches.orgId, orgId))
    .orderBy(desc(journalBatches.updatedAt))
    .limit(8);

  return rows.map((row) => ({
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
    description: row.description,
    status: row.status,
  }));
}

export async function getMemoryContext(orgId: number, message: string) {
  const tokens = message
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4)
    .slice(0, 6);

  if (tokens.length === 0) {
    return db
      .select()
      .from(kevinMemories)
      .where(eq(kevinMemories.orgId, orgId))
      .orderBy(desc(kevinMemories.updatedAt))
      .limit(8);
  }

  const conditions = tokens.map((token) => ilike(kevinMemories.value, `%${token}%`));
  return db
    .select()
    .from(kevinMemories)
    .where(and(eq(kevinMemories.orgId, orgId), sql.join(conditions, sql` or `)))
    .orderBy(desc(kevinMemories.updatedAt))
    .limit(8);
}

export async function searchDocumentContext(orgId: number, message: string) {
  const tokens = message
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 5)
    .slice(0, 5);

  if (tokens.length === 0) {
    return [];
  }

  const chunkConditions = tokens.map((token) => ilike(kevinDocumentChunks.content, `%${token}%`));
  const statementConditions = tokens.map((token) =>
    ilike(statementImports.sourceText, `%${token}%`),
  );
  const transactionConditions = tokens.map((token) =>
    ilike(parsedTransactions.description, `%${token}%`),
  );

  const chunks = await db
    .select({
      title: kevinDocuments.title,
      sourceType: kevinDocuments.sourceType,
      content: kevinDocumentChunks.content,
    })
    .from(kevinDocumentChunks)
    .innerJoin(kevinDocuments, eq(kevinDocumentChunks.documentId, kevinDocuments.id))
    .where(and(eq(kevinDocumentChunks.orgId, orgId), sql.join(chunkConditions, sql` or `)))
    .limit(5);

  const uploadedStatements = await db
    .select({
      title: statementImports.fileName,
      sourceText: statementImports.sourceText,
    })
    .from(statementImports)
    .where(and(eq(statementImports.orgId, orgId), sql.join(statementConditions, sql` or `)))
    .limit(3);

  const importedTransactions = await db
    .select({
      title: statementImports.fileName,
      transactionDate: parsedTransactions.transactionDate,
      description: parsedTransactions.description,
      amountCents: parsedTransactions.amountCents,
    })
    .from(parsedTransactions)
    .innerJoin(statementImports, eq(parsedTransactions.statementImportId, statementImports.id))
    .where(and(eq(parsedTransactions.orgId, orgId), sql.join(transactionConditions, sql` or `)))
    .limit(20);

  return [
    ...chunks.map((chunk) => ({
      title: chunk.title,
      sourceType: chunk.sourceType,
      content: truncate(chunk.content, 1_200),
    })),
    ...uploadedStatements.map((statement) => ({
      title: statement.title,
      sourceType: 'statement_import',
      content: truncate(statement.sourceText, 1_200),
    })),
    ...(importedTransactions.length > 0
      ? [
          {
            title: 'Imported statement transactions',
            sourceType: 'statement_transactions',
            content: truncate(
              importedTransactions
                .map(
                  (transaction) =>
                    `${transaction.transactionDate.toISOString().slice(0, 10)} ${transaction.title}: ${transaction.description} ${centsToDisplay(transaction.amountCents)}`,
                )
                .join('\n'),
              1_500,
            ),
          },
        ]
      : []),
  ];
}
