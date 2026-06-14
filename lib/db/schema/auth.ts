import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

export const memberRoleEnum = pgEnum('member_role', [
  'owner',
  'member',
  'viewer',
  'advisor',
  'bookkeeper',
]);

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 20 }).notNull().default('member'),
  currentOrgId: integer('current_org_id').references(() => organizations.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const organizations = pgTable(
  'organization',
  {
    id: serial('id').primaryKey(),
    publicId: varchar('public_id', { length: 5 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    taxId: varchar('tax_id', { length: 64 }),
    domicileCountry: varchar('domicile_country', { length: 100 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    fiscalYearEndMonth: integer('fiscal_year_end_month').notNull().default(12),
    slug: text('slug'),
    logo: text('logo'),
    metadata: jsonb('metadata'),
  },
  (table) => ({
    fiscalYearEndMonthCheck: check(
      'organization_fiscal_year_end_month_check',
      sql`${table.fiscalYearEndMonth} between 1 and 12`,
    ),
    slugUnique: uniqueIndex('teams_slug_unique_idx').on(table.slug),
    publicIdUnique: uniqueIndex('teams_public_id_unique_idx').on(table.publicId),
  }),
);

export const members = pgTable(
  'member',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    teamId: integer('team_id')
      .notNull()
      .references(() => organizations.id),
    role: memberRoleEnum('role').notNull(),
    joinedAt: timestamp('joined_at').notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('member_user_id_idx').on(table.userId),
    teamIdIdx: index('member_team_id_idx').on(table.teamId),
  }),
);

export const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => organizations.id),
  userId: integer('user_id').references(() => users.id),
  action: text('action').notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  ipAddress: varchar('ip_address', { length: 45 }),
});

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(members),
  activityLogs: many(activityLogs),
}));

export const usersRelations = relations(users, ({ many }) => ({
  members: many(members),
}));

export const membersRelations = relations(members, ({ one }) => ({
  user: one(users, {
    fields: [members.userId],
    references: [users.id],
  }),
  team: one(organizations, {
    fields: [members.teamId],
    references: [organizations.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  team: one(organizations, {
    fields: [activityLogs.teamId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;

export type OrganizationDataWithMembers = Organization & {
  members: (Member & {
    user: Pick<User, 'id' | 'name' | 'email'>;
  })[];
};

export enum ActivityType {
  SIGN_UP = 'SIGN_UP',
  SIGN_IN = 'SIGN_IN',
  SIGN_OUT = 'SIGN_OUT',
  UPDATE_PASSWORD = 'UPDATE_PASSWORD',
  DELETE_ACCOUNT = 'DELETE_ACCOUNT',
  UPDATE_ACCOUNT = 'UPDATE_ACCOUNT',
}
