import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { journalBatches } from './accounting';
import { organizations, users } from './auth';

export const kevinThreads = pgTable(
  'kevin_threads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: integer('org_id')
      .notNull()
      .references(() => organizations.id),
    title: text('title').notNull().default('Kevin chat'),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    orgUpdatedIdx: index('kevin_threads_org_updated_idx').on(table.orgId, table.updatedAt),
  }),
);

export const kevinMessages = pgTable(
  'kevin_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: integer('org_id')
      .notNull()
      .references(() => organizations.id),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => kevinThreads.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 20 }).notNull(),
    content: text('content').notNull(),
    model: varchar('model', { length: 100 }),
    provider: varchar('provider', { length: 30 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    threadCreatedIdx: index('kevin_messages_thread_created_idx').on(
      table.threadId,
      table.createdAt,
    ),
    orgCreatedIdx: index('kevin_messages_org_created_idx').on(table.orgId, table.createdAt),
  }),
);

export const kevinMemories = pgTable(
  'kevin_memories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: integer('org_id')
      .notNull()
      .references(() => organizations.id),
    key: varchar('key', { length: 120 }).notNull(),
    value: text('value').notNull(),
    category: varchar('category', { length: 60 }).notNull().default('general'),
    sourceMessageId: uuid('source_message_id').references(() => kevinMessages.id, {
      onDelete: 'set null',
    }),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    orgKeyUnique: uniqueIndex('kevin_memories_org_key_unique').on(table.orgId, table.key),
    orgCategoryIdx: index('kevin_memories_org_category_idx').on(table.orgId, table.category),
  }),
);

export const kevinActions = pgTable(
  'kevin_actions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: integer('org_id')
      .notNull()
      .references(() => organizations.id),
    threadId: uuid('thread_id').references(() => kevinThreads.id, {
      onDelete: 'set null',
    }),
    userId: integer('user_id').references(() => users.id),
    actionType: varchar('action_type', { length: 50 }).notNull(),
    status: varchar('status', { length: 30 }).notNull(),
    payload: jsonb('payload').notNull(),
    result: jsonb('result'),
    journalBatchId: uuid('journal_batch_id').references(() => journalBatches.id, {
      onDelete: 'set null',
    }),
    undoOfActionId: uuid('undo_of_action_id'),
    redoOfActionId: uuid('redo_of_action_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    undoOfFk: foreignKey({
      columns: [table.undoOfActionId],
      foreignColumns: [table.id],
    }),
    redoOfFk: foreignKey({
      columns: [table.redoOfActionId],
      foreignColumns: [table.id],
    }),
    orgCreatedIdx: index('kevin_actions_org_created_idx').on(table.orgId, table.createdAt),
    batchIdx: index('kevin_actions_journal_batch_idx').on(table.journalBatchId),
  }),
);

export const kevinDocuments = pgTable(
  'kevin_documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: integer('org_id')
      .notNull()
      .references(() => organizations.id),
    sourceType: varchar('source_type', { length: 40 }).notNull(),
    title: text('title').notNull(),
    fileName: text('file_name'),
    pathHash: varchar('path_hash', { length: 64 }),
    mimeType: varchar('mime_type', { length: 100 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    orgSourceIdx: index('kevin_documents_org_source_idx').on(table.orgId, table.sourceType),
    orgPathUnique: uniqueIndex('kevin_documents_org_path_unique').on(table.orgId, table.pathHash),
  }),
);

export const kevinDocumentChunks = pgTable(
  'kevin_document_chunks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: integer('org_id')
      .notNull()
      .references(() => organizations.id),
    documentId: uuid('document_id')
      .notNull()
      .references(() => kevinDocuments.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    documentChunkUnique: uniqueIndex('kevin_document_chunks_doc_index_unique').on(
      table.documentId,
      table.chunkIndex,
    ),
    orgDocumentIdx: index('kevin_document_chunks_org_document_idx').on(
      table.orgId,
      table.documentId,
    ),
  }),
);

export type KevinThread = typeof kevinThreads.$inferSelect;
export type NewKevinThread = typeof kevinThreads.$inferInsert;
export type KevinMessage = typeof kevinMessages.$inferSelect;
export type NewKevinMessage = typeof kevinMessages.$inferInsert;
export type KevinMemory = typeof kevinMemories.$inferSelect;
export type NewKevinMemory = typeof kevinMemories.$inferInsert;
export type KevinAction = typeof kevinActions.$inferSelect;
export type NewKevinAction = typeof kevinActions.$inferInsert;
export type KevinDocument = typeof kevinDocuments.$inferSelect;
export type NewKevinDocument = typeof kevinDocuments.$inferInsert;
export type KevinDocumentChunk = typeof kevinDocumentChunks.$inferSelect;
export type NewKevinDocumentChunk = typeof kevinDocumentChunks.$inferInsert;
