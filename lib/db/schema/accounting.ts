import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { organizations, users } from './auth';

export const accountTypeEnum = pgEnum('account_type', [
  'asset',
  'liability',
  'equity',
  'income',
  'expense',
]);

export const accountClassificationEnum = pgEnum('account_classification', [
  'current_asset',
  'noncurrent_asset',
  'fixed_asset',
  'other_asset',
  'current_liability',
  'noncurrent_liability',
  'other_liability',
  'equity',
  'common_stock',
  'preferred_stock',
  'additional_paid_in_capital',
  'treasury_stock',
  'retained_earnings',
  'dividends_equity',
  'foreign_currency_translation',
  'other_equity',
  'income',
  'sales',
  'interest_income',
  'dividend_income',
  'other_income',
  'expense',
  'operating_expense',
  'cogs',
  'depreciation',
  'fixed_costs',
  'variable_expenses',
  'other_expense',
]);

export const journalBatchStatusEnum = pgEnum('journal_batch_status', ['draft', 'posted', 'voided']);

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: integer('org_id')
      .notNull()
      .references(() => organizations.id),
    code: varchar('code', { length: 5 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    type: accountTypeEnum('type').notNull(),
    classification: accountClassificationEnum('classification'),
    isActive: boolean('is_active').notNull().default(true),
    isStatementAccount: boolean('is_statement_account').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    codeFormatCheck: check('accounts_code_format_check', sql`${table.code} ~ '^[0-9]{5}$'`),
    orgCodeUnique: uniqueIndex('accounts_org_id_code_unique').on(table.orgId, table.code),
    orgTypeIdx: index('accounts_org_type_idx').on(table.orgId, table.type),
  }),
);

export const journalBatches = pgTable(
  'journal_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: integer('org_id')
      .notNull()
      .references(() => organizations.id),
    date: timestamp('date').notNull(),
    description: text('description').notNull(),
    status: journalBatchStatusEnum('status').notNull().default('draft'),
    createdBy: integer('created_by').references(() => users.id),
    supersedesBatchId: uuid('supersedes_batch_id'),
    sourceType: varchar('source_type', { length: 50 }),
    sourceRef: jsonb('source_ref'),
    sourceRefHash: varchar('source_ref_hash', { length: 64 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    supersedesFk: foreignKey({
      columns: [table.supersedesBatchId],
      foreignColumns: [table.id],
    }),
    sourceDedupeIdx: uniqueIndex('journal_batches_source_dedupe_idx').on(
      table.orgId,
      table.sourceType,
      table.sourceRefHash,
    ),
    onePostedChildPerSupersededIdx: uniqueIndex(
      'journal_batches_one_posted_child_per_superseded_idx',
    )
      .on(table.orgId, table.supersedesBatchId)
      .where(sql`${table.supersedesBatchId} is not null and ${table.status} = 'posted'`),
  }),
);

export const journalLines = pgTable(
  'journal_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: integer('org_id')
      .notNull()
      .references(() => organizations.id),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => journalBatches.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    narration: text('narration'),
    debit: integer('debit').notNull().default(0),
    credit: integer('credit').notNull().default(0),
    glDate: timestamp('gl_date').notNull().defaultNow(),
    sourceType: varchar('source_type', { length: 50 }),
    sourceRef: jsonb('source_ref'),
  },
  (table) => ({
    debitNonnegativeCheck: check('journal_lines_debit_nonnegative_check', sql`${table.debit} >= 0`),
    creditNonnegativeCheck: check(
      'journal_lines_credit_nonnegative_check',
      sql`${table.credit} >= 0`,
    ),
    oneSidedAmountCheck: check(
      'journal_lines_one_sided_amount_check',
      sql`${table.debit} = 0 or ${table.credit} = 0`,
    ),
    nonzeroAmountCheck: check(
      'journal_lines_nonzero_amount_check',
      sql`${table.debit} > 0 or ${table.credit} > 0`,
    ),
    orgGlDateIdx: index('journal_lines_org_gl_date_idx').on(table.orgId, table.glDate),
    batchIdIdx: index('journal_lines_batch_id_idx').on(table.batchId),
    accountIdIdx: index('journal_lines_account_id_idx').on(table.accountId),
  }),
);

export const accountMappingRules = pgTable(
  'account_mapping_rules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: integer('org_id')
      .notNull()
      .references(() => organizations.id),
    descriptionPattern: text('description_pattern').notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    createdBy: integer('created_by').references(() => users.id),
    timesUsed: integer('times_used').default(1).notNull(),
  },
  (table) => ({
    orgDescIdx: index('account_mapping_rules_org_desc_idx').on(
      table.orgId,
      table.descriptionPattern,
    ),
  }),
);

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type JournalBatch = typeof journalBatches.$inferSelect;
export type NewJournalBatch = typeof journalBatches.$inferInsert;
export type JournalLine = typeof journalLines.$inferSelect;
export type NewJournalLine = typeof journalLines.$inferInsert;
export type AccountMappingRule = typeof accountMappingRules.$inferSelect;
export type NewAccountMappingRule = typeof accountMappingRules.$inferInsert;
