// This file handles chart-of-accounts queries and accounting guardrails.
// It loads accounts for a team, checks whether the CoA is active, and
// protects system-owned ledger accounts from being edited incorrectly.

import { and, eq, sql } from 'drizzle-orm';

import { db } from '../drizzle';
import { accounts } from '../schema';
const SYSTEM_EQUITY_ACCOUNTS = [
  {
    name: 'Opening Balance Equity',
    code: '39900',
    classification: 'other_equity' as const,
  },
  {
    name: 'Prior Period Adjustments',
    code: '39800',
    classification: 'other_equity' as const,
  },
];

export async function getAccountsForTeam(teamId: number) {
  const rows = await db
    .select({
      id: accounts.id,
      orgId: accounts.orgId,
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      classification: accounts.classification,
      isActive: accounts.isActive,
      isStatementAccount: accounts.isStatementAccount,
      createdAt: accounts.createdAt,
      updatedAt: accounts.updatedAt,
    })
    .from(accounts)
    .where(eq(accounts.orgId, teamId))
    .orderBy(accounts.code);

  return rows;
}

export async function getActiveAccountCount(teamId: number): Promise<number> {
  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(accounts)
    .where(and(eq(accounts.orgId, teamId), eq(accounts.isActive, true)));

  return Number(result[0]?.count ?? 0);
}

export async function requireActiveCoa(teamId: number) {
  const activeCount = await getActiveAccountCount(teamId);
  if (activeCount === 0) {
    throw new Error('CoA is not active. Seed or import a Chart of Accounts before continuing.');
  }
}

export async function ensureSystemEquityAccounts(teamId: number): Promise<{
  openingBalanceEquityAccountId: string;
  priorPeriodAdjustmentsAccountId: string;
}> {
  const ids: Record<string, string> = {};

  for (const systemAcc of SYSTEM_EQUITY_ACCOUNTS) {
    const [existing] = await db
      .select({
        id: accounts.id,
        name: accounts.name,
        type: accounts.type,
        classification: accounts.classification,
        code: accounts.code,
      })
      .from(accounts)
      .where(and(eq(accounts.orgId, teamId), eq(accounts.name, systemAcc.name)))
      .limit(1);

    if (!existing) {
      const [created] = await db
        .insert(accounts)
        .values({
          orgId: teamId,
          code: systemAcc.code,
          name: systemAcc.name,
          type: 'equity',
          classification: systemAcc.classification,
          isActive: true,
          isStatementAccount: false,
        })
        .returning({ id: accounts.id });
      if (!created) {
        throw new Error(`Unable to create system account "${systemAcc.name}".`);
      }

      ids[systemAcc.name] = created.id;
      continue;
    }

    if (existing.type !== 'equity') {
      throw new Error(
        `${systemAcc.name} must remain an equity account with classification "${systemAcc.classification}".`,
      );
    }

    if (existing.classification !== systemAcc.classification) {
      await db
        .update(accounts)
        .set({
          classification: systemAcc.classification,
          isActive: true,
          isStatementAccount: false,
          updatedAt: new Date(),
        })
        .where(and(eq(accounts.id, existing.id), eq(accounts.orgId, teamId)));
    }

    ids[systemAcc.name] = existing.id;
  }

  return {
    openingBalanceEquityAccountId: ids['Opening Balance Equity']!,
    priorPeriodAdjustmentsAccountId: ids['Prior Period Adjustments']!,
  };
}

export function isProtectedSystemAccount(account: {
  name: string;
  type?: string | null;
  classification?: string | null;
}): boolean {
  const protectedNames = ['Retained Earnings', ...SYSTEM_EQUITY_ACCOUNTS.map((a) => a.name)];
  return protectedNames.some((name) => name.toLowerCase() === account.name.toLowerCase());
}

export async function updateAccountForTeam(
  teamId: number,
  accountId: string,
  data: {
    name?: string;
    isActive?: boolean;
    isStatementAccount?: boolean;
  },
) {
  const [existing] = await db
    .select({
      name: accounts.name,
      type: accounts.type,
      classification: accounts.classification,
    })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.orgId, teamId)))
    .limit(1);

  if (!existing) {
    throw new Error('Account not found');
  }

  if (isProtectedSystemAccount(existing)) {
    throw new Error('This account is system-protected and cannot be edited.');
  }

  await db
    .update(accounts)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(and(eq(accounts.id, accountId), eq(accounts.orgId, teamId)));
}

export async function createAccountForTeam(
  teamId: number,
  data: {
    code: string;
    name: string;
    type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
    classification?: (typeof accounts.$inferInsert)['classification'] | null;
    isActive?: boolean;
    isStatementAccount?: boolean;
  },
) {
  await db.insert(accounts).values({
    orgId: teamId,
    code: data.code,
    name: data.name,
    type: data.type,
    classification: data.classification ?? null,
    isActive: data.isActive ?? true,
    isStatementAccount: data.isStatementAccount ?? false,
  });
}
