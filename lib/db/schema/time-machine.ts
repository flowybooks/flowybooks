import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  index,
} from 'drizzle-orm/pg-core';

import { organizations, users } from './auth';

export type TimeMachineSnapshotPayload = {
  version: 1;
  capturedAt: string;
  tables: {
    orgSettings: Record<string, unknown>[];
    accounts: Record<string, unknown>[];
    journalBatches: Record<string, unknown>[];
    journalLines: Record<string, unknown>[];
    statementImports: Record<string, unknown>[];
    parsedTransactions: Record<string, unknown>[];
    accountMappingRules: Record<string, unknown>[];
    kevinThreads: Record<string, unknown>[];
    kevinMessages: Record<string, unknown>[];
    kevinMemories: Record<string, unknown>[];
    kevinActions: Record<string, unknown>[];
    kevinDocuments: Record<string, unknown>[];
    kevinDocumentChunks: Record<string, unknown>[];
  };
};

export const timeMachineSnapshots = pgTable(
  'time_machine_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: integer('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    description: text('description'),
    reason: varchar('reason', { length: 60 }).notNull().default('manual'),
    sourceType: varchar('source_type', { length: 60 }),
    sourceId: varchar('source_id', { length: 100 }),
    payload: jsonb('payload').$type<TimeMachineSnapshotPayload>().notNull(),
    createdBy: integer('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    orgCreatedIdx: index('time_machine_snapshots_org_created_idx').on(table.orgId, table.createdAt),
    orgSourceIdx: index('time_machine_snapshots_org_source_idx').on(
      table.orgId,
      table.sourceType,
      table.sourceId,
    ),
  }),
);

export type TimeMachineSnapshot = typeof timeMachineSnapshots.$inferSelect;
export type NewTimeMachineSnapshot = typeof timeMachineSnapshots.$inferInsert;
