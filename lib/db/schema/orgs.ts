import { integer, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { organizations } from './auth';

export const orgSettings = pgTable(
  'org_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: integer('org_id')
      .notNull()
      .references(() => organizations.id),
    booksStartDate: timestamp('books_start_date'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgUnique: uniqueIndex('org_settings_org_unique').on(table.orgId),
  }),
);

export type OrgSetting = typeof orgSettings.$inferSelect;
export type NewOrgSetting = typeof orgSettings.$inferInsert;
