import { describe, expect, it } from 'vitest';
import { TransactionRollbackError } from 'drizzle-orm/errors';
import { db } from '../../lib/db/drizzle';
import { accounts, members, organizations, users } from '../../lib/db/schema';
import { createPostedJournalBatchTx } from '../../lib/accounting/journal-service';
import { getGeneralLedgerTx } from '../../lib/accounting/reports/general-ledger';
import { parseAccountingDateKey } from '../../lib/utils/accounting-date';
import { parseIsoDateParam } from '../../lib/utils/iso-date';

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

async function withRollback(fn: (tx: DbTx) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await fn(tx);
      tx.rollback();
    });
  } catch (err) {
    if (err instanceof TransactionRollbackError) {
      return;
    }
    throw err;
  }
}

async function seedOrgUser(tx: DbTx) {
  const publicId = crypto.randomUUID().replace(/-/g, '').slice(0, 5);
  const [org] = await tx
    .insert(organizations)
    .values({
      publicId,
      name: `Test Org ${publicId}`,
    })
    .returning({ id: organizations.id });

  const [user] = await tx
    .insert(users)
    .values({
      email: `${randomId('user')}@example.com`,
      passwordHash: 'test',
    })
    .returning({ id: users.id });
  if (!org || !user) {
    throw new Error('Failed to seed test org/user');
  }

  await tx.insert(members).values({
    userId: user.id,
    teamId: org.id,
    role: 'owner',
  });

  return { orgId: org.id, userId: user.id };
}

async function seedAccounts(tx: DbTx, orgId: number) {
  const bankCode = String(Math.floor(Math.random() * 90000) + 10000);
  const incomeCode = String(Math.floor(Math.random() * 90000) + 10000);
  const expenseCode = String(Math.floor(Math.random() * 90000) + 10000);

  const [bank] = await tx
    .insert(accounts)
    .values({
      orgId,
      code: bankCode,
      name: `Bank ${bankCode}`,
      type: 'asset',
    })
    .returning({ id: accounts.id });

  const [income] = await tx
    .insert(accounts)
    .values({
      orgId,
      code: incomeCode,
      name: `Income ${incomeCode}`,
      type: 'income',
    })
    .returning({ id: accounts.id });

  const [expense] = await tx
    .insert(accounts)
    .values({
      orgId,
      code: expenseCode,
      name: `Expense ${expenseCode}`,
      type: 'expense',
    })
    .returning({ id: accounts.id });
  if (!bank || !income || !expense) {
    throw new Error('Failed to seed ledger test accounts');
  }

  return {
    bankAccountId: bank.id,
    incomeAccountId: income.id,
    incomeCode,
    expenseAccountId: expense.id,
    expenseCode,
  };
}

describe('general ledger report filters', () => {
  it('supports multi-account filtering and ignores accountCode when accountIds are present', async () => {
    await withRollback(async (tx) => {
      const { orgId, userId } = await seedOrgUser(tx);
      const { bankAccountId, incomeAccountId, incomeCode, expenseAccountId, expenseCode } =
        await seedAccounts(tx, orgId);

      const glDate = parseAccountingDateKey('2026-01-31')!;

      await createPostedJournalBatchTx(tx, {
        orgId,
        date: glDate,
        description: 'Income journal',
        createdByUserId: userId,
        lines: [
          { accountId: bankAccountId, glDate, debit: 100_00, credit: 0 },
          { accountId: incomeAccountId, glDate, debit: 0, credit: 100_00 },
        ],
      });

      await createPostedJournalBatchTx(tx, {
        orgId,
        date: glDate,
        description: 'Expense journal',
        createdByUserId: userId,
        lines: [
          { accountId: bankAccountId, glDate, debit: 50_00, credit: 0 },
          { accountId: expenseAccountId, glDate, debit: 0, credit: 50_00 },
        ],
      });

      const multi = await getGeneralLedgerTx(tx, {
        orgId,
        fromDate: glDate,
        toDate: glDate,
        accountIds: [incomeAccountId, expenseAccountId],
      });

      expect(multi).toHaveLength(2);
      expect(new Set(multi.map((line) => line.accountId))).toEqual(
        new Set([incomeAccountId, expenseAccountId]),
      );

      const withConflictingCode = await getGeneralLedgerTx(tx, {
        orgId,
        fromDate: glDate,
        toDate: glDate,
        accountIds: [incomeAccountId],
        accountCode: expenseCode,
      });

      expect(withConflictingCode).toHaveLength(1);
      expect(withConflictingCode[0]?.accountId).toBe(incomeAccountId);
      expect(withConflictingCode[0]?.accountCode).toBe(incomeCode);
    });
  });

  it('strictly parses ISO date params (3-digit year falls back)', () => {
    const fallback = new Date('2025-01-01T00:00:00.000Z');
    const parsed = parseIsoDateParam('202-01-31', fallback);
    expect(parsed).toBe(fallback);
  });
});
