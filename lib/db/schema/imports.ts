import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { accounts, journalBatches } from './accounting';
import { organizations, users } from './auth';

export type ParsedTransactionAllocation = {
  accountId: string;
  amountCents: number;
};

export const statementTypeEnum = pgEnum('statement_type', [
  'bank_statement',
  'credit_card_statement',
  'sba_loan',
  'factoring_loan',
  'secured_loan',
  'auto_loan',
  'lease',
]);

export const statementImportStatusEnum = pgEnum('statement_import_status', [
  'uploaded',
  'extracting',
  'extracted',
  'reviewing',
  'approved',
  'imported',
  'failed',
]);

export const categoryConfidenceEnum = pgEnum('category_confidence', [
  'high',
  'medium',
  'low',
  'manual',
]);

export const statementImports = pgTable(
  'statement_imports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: integer('org_id')
      .notNull()
      .references(() => organizations.id),
    importBatchId: varchar('import_batch_id', { length: 36 }).notNull(),
    linkedAccountId: uuid('linked_account_id').references(() => accounts.id),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    fileSize: integer('file_size').notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    fileChecksum: varchar('file_checksum', { length: 64 }),
    sourceText: text('source_text').notNull(),
    sourcePageCount: integer('source_page_count'),
    sourceInfo: jsonb('source_info'),
    statementType: statementTypeEnum('statement_type'),
    institutionName: varchar('institution_name', { length: 255 }),
    accountNumber: varchar('account_number', { length: 50 }),
    statementStartDate: timestamp('statement_start_date'),
    statementEndDate: timestamp('statement_end_date'),
    beginningBalanceCents: integer('beginning_balance_cents'),
    endingBalanceCents: integer('ending_balance_cents'),
    status: statementImportStatusEnum('status').notNull().default('uploaded'),
    extractionModel: varchar('extraction_model', { length: 100 }),
    errorMessage: text('error_message'),
    uploadedBy: integer('uploaded_by').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    batchOrgIdx: index('statement_imports_batch_idx').on(table.importBatchId, table.orgId),
  }),
);

export const parsedTransactions = pgTable(
  'parsed_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: integer('org_id')
      .notNull()
      .references(() => organizations.id),
    statementImportId: uuid('statement_import_id')
      .notNull()
      .references(() => statementImports.id, { onDelete: 'cascade' }),
    transactionDate: timestamp('transaction_date').notNull(),
    description: text('description').notNull(),
    rawDescription: text('raw_description').notNull(),
    normalizedDescription: text('normalized_description').notNull(),
    amountCents: integer('amount_cents').notNull(),
    checkNumber: varchar('check_number', { length: 20 }),
    suggestedAccountId: uuid('suggested_account_id').references(() => accounts.id),
    suggestedCategoryReason: text('suggested_category_reason'),
    categoryConfidence: categoryConfidenceEnum('category_confidence'),
    confirmedAccountId: uuid('confirmed_account_id').references(() => accounts.id),
    allocations: jsonb('allocations').$type<ParsedTransactionAllocation[]>(),
    isExcluded: boolean('is_excluded').notNull().default(false),
    journalBatchId: uuid('journal_batch_id').references(() => journalBatches.id),
    lineNumber: integer('line_number').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    importOrgIdx: index('parsed_transactions_import_org_idx').on(
      table.statementImportId,
      table.orgId,
    ),
  }),
);

export type StatementImport = typeof statementImports.$inferSelect;
export type NewStatementImport = typeof statementImports.$inferInsert;
export type ParsedTransaction = typeof parsedTransactions.$inferSelect;
export type NewParsedTransaction = typeof parsedTransactions.$inferInsert;
