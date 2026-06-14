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

import { organizations, users } from './auth';

export const auditActionEnum = pgEnum('audit_action', [
  'create',
  'update',
  'delete',
  'void',
  'post',
  'unpost',
]);

export const auditSourceEnum = pgEnum('audit_source', [
  'web_ui',
  'api',
  'system',
  'import',
  'migration',
]);

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: integer('org_id')
      .notNull()
      .references(() => organizations.id),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    timestamp: timestamp('timestamp').defaultNow().notNull(),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    action: auditActionEnum('action').notNull(),
    previousState: jsonb('previous_state'),
    newState: jsonb('new_state').notNull(),
    changeReason: text('change_reason'),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    sessionId: varchar('session_id', { length: 100 }),
    source: auditSourceEnum('source').notNull().default('web_ui'),
    success: boolean('success').notNull().default(true),
    errorMessage: text('error_message'),
  },
  (table) => ({
    orgTimestampIdx: index('audit_log_org_timestamp_idx').on(table.orgId, table.timestamp),
    entityIdx: index('audit_log_entity_idx').on(table.entityType, table.entityId),
    userIdx: index('audit_log_user_idx').on(table.userId),
  }),
);

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
