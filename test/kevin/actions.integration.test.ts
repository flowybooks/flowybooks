import { describe, expect, it, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

vi.mock('server-only', () => ({}));

import {
  askKevin,
  createKevinJournalFromProposal,
  getLatestKevinThreadSnapshot,
  undoKevinAction,
} from '@/lib/kevin/service';
import { getBalanceSheet } from '@/lib/accounting/reports/balance-sheet';
import { db } from '@/lib/db/drizzle';
import {
  accounts,
  auditLog,
  journalBatches,
  journalLines,
  kevinActions,
  kevinMessages,
  kevinThreads,
  members,
  organizations,
  timeMachineSnapshots,
  users,
} from '@/lib/db/schema';

function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

async function cleanup(params: {
  orgId?: number;
  userId?: number;
  accountIds: string[];
  batchIds: string[];
}) {
  if (params.orgId) {
    await db.delete(kevinActions).where(eq(kevinActions.orgId, params.orgId));
    await db.delete(kevinMessages).where(eq(kevinMessages.orgId, params.orgId));
    await db.delete(kevinThreads).where(eq(kevinThreads.orgId, params.orgId));
    await db.delete(timeMachineSnapshots).where(eq(timeMachineSnapshots.orgId, params.orgId));
  }

  if (params.batchIds.length > 0) {
    await db.delete(auditLog).where(inArray(auditLog.entityId, params.batchIds));
    await db.delete(journalLines).where(inArray(journalLines.batchId, params.batchIds));
    await db.delete(journalBatches).where(inArray(journalBatches.id, params.batchIds));
  }

  if (params.orgId) {
    await db.delete(accounts).where(eq(accounts.orgId, params.orgId));
  } else if (params.accountIds.length > 0) {
    await db.delete(accounts).where(inArray(accounts.id, params.accountIds));
  }

  if (params.orgId) {
    await db.delete(members).where(eq(members.teamId, params.orgId));
  }

  if (params.userId) {
    await db.delete(users).where(eq(users.id, params.userId));
  }

  if (params.orgId) {
    await db.delete(organizations).where(eq(organizations.id, params.orgId));
  }
}

async function seedOrgUserAndAccounts() {
  const publicId = crypto.randomUUID().replace(/-/g, '').slice(0, 5);
  const [org] = await db
    .insert(organizations)
    .values({ publicId, name: `Kevin Test Org ${publicId}` })
    .returning({ id: organizations.id });

  const [user] = await db
    .insert(users)
    .values({
      email: `${randomId('kevin_user')}@example.com`,
      passwordHash: 'test',
    })
    .returning({ id: users.id });
  if (!org || !user) {
    throw new Error('Failed to seed Kevin test org/user');
  }

  await db.insert(members).values({
    userId: user.id,
    teamId: org.id,
    role: 'owner',
  });

  const seededAccounts = await db
    .insert(accounts)
    .values([
      {
        orgId: org.id,
        code: '21000',
        name: 'Accounts Payable',
        type: 'liability',
      },
      {
        orgId: org.id,
        code: '60000',
        name: 'Utilities Expense',
        type: 'expense',
      },
    ])
    .returning({ id: accounts.id, code: accounts.code });

  return {
    orgId: org.id,
    userId: user.id,
    accountIds: seededAccounts.map((account) => account.id),
  };
}

async function seedOrgAndUser() {
  const publicId = crypto.randomUUID().replace(/-/g, '').slice(0, 5);
  const [org] = await db
    .insert(organizations)
    .values({ publicId, name: `Kevin CoA Test Org ${publicId}` })
    .returning({ id: organizations.id });

  const [user] = await db
    .insert(users)
    .values({
      email: `${randomId('kevin_coa_user')}@example.com`,
      passwordHash: 'test',
    })
    .returning({ id: users.id });
  if (!org || !user) {
    throw new Error('Failed to seed Kevin CoA test org/user');
  }

  await db.insert(members).values({
    userId: user.id,
    teamId: org.id,
    role: 'owner',
  });

  return {
    orgId: org.id,
    userId: user.id,
  };
}

async function seedOrgUserAndCashExpenseAccounts() {
  const publicId = crypto.randomUUID().replace(/-/g, '').slice(0, 5);
  const [org] = await db
    .insert(organizations)
    .values({ publicId, name: `Kevin Date Test Org ${publicId}` })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      email: `${randomId('kevin_date_user')}@example.com`,
      passwordHash: 'test',
    })
    .returning({ id: users.id });
  if (!org || !user) {
    throw new Error('Failed to seed Kevin date test org/user');
  }

  await db.insert(members).values({
    userId: user.id,
    teamId: org.id,
    role: 'owner',
  });

  const seededAccounts = await db
    .insert(accounts)
    .values([
      {
        orgId: org.id,
        code: '10000',
        name: 'Cash',
        type: 'asset',
      },
      {
        orgId: org.id,
        code: '60000',
        name: 'Operating Expense',
        type: 'expense',
      },
    ])
    .returning({ id: accounts.id, code: accounts.code });

  const accountIdByCode = new Map(seededAccounts.map((account) => [account.code, account.id]));

  return {
    org,
    orgId: org.id,
    userId: user.id,
    accountIds: seededAccounts.map((account) => account.id),
    cashAccountId: accountIdByCode.get('10000')!,
    expenseAccountId: accountIdByCode.get('60000')!,
  };
}

describe('Kevin journal actions', () => {
  it('applies the bundled standard chart of accounts from an explicit Kevin request', async () => {
    let orgId: number | undefined;
    let userId: number | undefined;

    try {
      const seeded = await seedOrgAndUser();
      orgId = seeded.orgId;
      userId = seeded.userId;

      const result = await askKevin({
        orgId,
        userId,
        message: 'Apply the standard chart of accounts to this workspace.',
      });

      expect(result.model).toBeNull();
      expect(result.action).toMatchObject({
        actionType: 'apply_standard_coa',
        status: 'applied',
        journalBatchId: null,
      });
      expect(result.response.answer).toContain('I applied the bundled standard chart of accounts');

      const snapshot = await getLatestKevinThreadSnapshot(orgId);
      expect(snapshot.threadId).toBe(result.threadId);
      expect(snapshot.messages.map((message) => message.content)).toEqual([
        'Apply the standard chart of accounts to this workspace.',
        result.response.answer,
      ]);

      const orgAccounts = await db
        .select({
          code: accounts.code,
          name: accounts.name,
          classification: accounts.classification,
        })
        .from(accounts)
        .where(eq(accounts.orgId, orgId));

      expect(orgAccounts.length).toBeGreaterThan(10);
      expect(orgAccounts).toContainEqual({
        code: '31000',
        name: 'Retained Earnings',
        classification: 'retained_earnings',
      });
    } finally {
      await cleanup({
        ...(orgId !== undefined ? { orgId } : {}),
        ...(userId !== undefined ? { userId } : {}),
        accountIds: [],
        batchIds: [],
      });
    }
  });

  it('keeps Kevin-created journal dates on the requested accounting date', async () => {
    const batchIds: string[] = [];
    let orgId: number | undefined;
    let userId: number | undefined;
    let accountIds: string[] = [];

    try {
      const seeded = await seedOrgUserAndCashExpenseAccounts();
      orgId = seeded.orgId;
      userId = seeded.userId;
      accountIds = seeded.accountIds;

      const result = await createKevinJournalFromProposal({
        orgId,
        userId,
        threadId: null,
        status: 'posted',
        proposal: {
          description: 'Record coffee beans purchased with cash for office/staff use',
          date: '2026-01-15',
          confidence: 'high',
          factsUsed: ['date', 'amount', 'cash payment', 'office/staff use'],
          missingFacts: [],
          lines: [
            {
              accountCode: '60000',
              accountName: 'Operating Expense',
              debitCents: 10_000,
              creditCents: 0,
              memo: 'Coffee beans for office/staff use',
            },
            {
              accountCode: '10000',
              accountName: 'Cash',
              debitCents: 0,
              creditCents: 10_000,
              memo: 'Cash paid for coffee beans',
            },
          ],
        },
      });
      expect(result.journalBatchId).toBeTruthy();
      batchIds.push(result.journalBatchId!);

      const jan14 = await getBalanceSheet({
        team: seeded.org,
        asOfDate: new Date(2026, 0, 14),
      });
      const jan15 = await getBalanceSheet({
        team: seeded.org,
        asOfDate: new Date(2026, 0, 15),
      });

      const jan14Cash = jan14.assets.find((row) => row.accountId === seeded.cashAccountId);
      const jan15Cash = jan15.assets.find((row) => row.accountId === seeded.cashAccountId);

      expect(jan14Cash?.amount ?? 0).toBe(0);
      expect(jan15Cash?.amount).toBe(-10_000);
    } finally {
      await cleanup({
        ...(orgId !== undefined ? { orgId } : {}),
        ...(userId !== undefined ? { userId } : {}),
        accountIds,
        batchIds,
      });
    }
  });

  it('posts and undoes by restoring the pre-action Time Machine checkpoint', async () => {
    const batchIds: string[] = [];
    let orgId: number | undefined;
    let userId: number | undefined;
    let accountIds: string[] = [];

    try {
      const seeded = await seedOrgUserAndAccounts();
      orgId = seeded.orgId;
      userId = seeded.userId;
      accountIds = seeded.accountIds;
      const activeOrgId = seeded.orgId;
      const activeUserId = seeded.userId;

      const proposal = {
        date: '2026-06-30',
        description: 'Accrue June utilities',
        confidence: 'medium' as const,
        factsUsed: ['invoice amount', 'service period', 'unpaid at month end'],
        missingFacts: [],
        lines: [
          {
            accountCode: '60000',
            accountName: 'Utilities Expense',
            debitCents: 25_000,
            creditCents: 0,
            memo: 'June utility accrual',
          },
          {
            accountCode: '21000',
            accountName: 'Accounts Payable',
            debitCents: 0,
            creditCents: 25_000,
            memo: 'June utility accrual',
          },
        ],
      };

      const posted = await createKevinJournalFromProposal({
        orgId: activeOrgId,
        userId: activeUserId,
        threadId: null,
        proposal,
        status: 'posted',
      });
      expect(posted.actionType).toBe('post_journal');
      expect(posted.status).toBe('posted');
      expect(posted.journalBatchId).toBeTruthy();
      batchIds.push(posted.journalBatchId!);

      const [postedBatch] = await db
        .select({
          status: journalBatches.status,
          sourceType: journalBatches.sourceType,
        })
        .from(journalBatches)
        .where(eq(journalBatches.id, posted.journalBatchId!))
        .limit(1);
      expect(postedBatch).toEqual({
        status: 'posted',
        sourceType: 'kevin_post',
      });

      const postedLines = await db
        .select({
          debit: journalLines.debit,
          credit: journalLines.credit,
        })
        .from(journalLines)
        .where(eq(journalLines.batchId, posted.journalBatchId!));
      expect(postedLines.reduce((sum, line) => sum + line.debit, 0)).toBe(25_000);
      expect(postedLines.reduce((sum, line) => sum + line.credit, 0)).toBe(25_000);

      const undone = await undoKevinAction({
        orgId: activeOrgId,
        userId: activeUserId,
        actionId: posted.actionId,
      });
      expect(undone.actionType).toBe('time_machine_restore');
      expect(undone.status).toBe('restored');
      expect(undone.journalBatchId).toBeNull();

      const [restoredBatch] = await db
        .select({
          status: journalBatches.status,
          sourceType: journalBatches.sourceType,
        })
        .from(journalBatches)
        .where(eq(journalBatches.id, posted.journalBatchId!))
        .limit(1);
      expect(restoredBatch).toBeUndefined();

      const [originalAction] = await db
        .select({ status: kevinActions.status })
        .from(kevinActions)
        .where(and(eq(kevinActions.orgId, activeOrgId), eq(kevinActions.id, posted.actionId)))
        .limit(1);
      expect(originalAction).toBeUndefined();

      const [safetySnapshot] = await db
        .select({ reason: timeMachineSnapshots.reason })
        .from(timeMachineSnapshots)
        .where(
          and(
            eq(timeMachineSnapshots.orgId, activeOrgId),
            eq(timeMachineSnapshots.reason, 'pre_restore'),
          ),
        )
        .limit(1);
      expect(safetySnapshot).toBeDefined();
    } finally {
      await cleanup({
        ...(orgId !== undefined ? { orgId } : {}),
        ...(userId !== undefined ? { userId } : {}),
        accountIds,
        batchIds,
      });
    }
  });

  it('routes explicit undo chat requests through Time Machine restore', async () => {
    const batchIds: string[] = [];
    let orgId: number | undefined;
    let userId: number | undefined;
    let accountIds: string[] = [];

    try {
      const seeded = await seedOrgUserAndAccounts();
      orgId = seeded.orgId;
      userId = seeded.userId;
      accountIds = seeded.accountIds;

      const posted = await createKevinJournalFromProposal({
        orgId,
        userId,
        threadId: null,
        proposal: {
          date: '2026-06-30',
          description: 'Accrue June utilities',
          confidence: 'medium',
          factsUsed: [],
          missingFacts: [],
          lines: [
            {
              accountCode: '60000',
              accountName: 'Utilities Expense',
              debitCents: 10_000,
              creditCents: 0,
              memo: 'June utility accrual',
            },
            {
              accountCode: '21000',
              accountName: 'Accounts Payable',
              debitCents: 0,
              creditCents: 10_000,
              memo: 'June utility accrual',
            },
          ],
        },
        status: 'posted',
      });
      batchIds.push(posted.journalBatchId!);

      const undone = await askKevin({
        orgId,
        userId,
        message: 'Undo the latest action.',
      });
      expect(undone.model).toBeNull();
      expect(undone.action).toMatchObject({
        actionType: 'time_machine_restore',
        status: 'restored',
      });

      const redone = await askKevin({
        orgId,
        userId,
        message: 'Redo the latest action.',
      });
      expect(redone.model).toBeNull();
      expect(redone.action).toBeNull();
      expect(redone.response.answer).toContain('Time Machine');
    } finally {
      await cleanup({
        ...(orgId !== undefined ? { orgId } : {}),
        ...(userId !== undefined ? { userId } : {}),
        accountIds,
        batchIds,
      });
    }
  });
});
