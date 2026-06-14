// These integration tests cover accounting workflows that must stay atomic.
// They exercise journal revisions, draft deletion, and statement-import posting
// so refactors do not break bookkeeping safety guarantees.

import { describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { TransactionRollbackError } from 'drizzle-orm/errors';
import { db } from '../../lib/db/drizzle';
import {
  accounts,
  auditLog,
  journalBatches,
  journalLines,
  members,
  organizations,
  parsedTransactions,
  statementImports,
  users,
} from '../../lib/db/schema';
import {
  adjustJournalBatchTx,
  createDraftJournalBatchTx,
  createPostedJournalBatch,
  createPostedJournalBatchTx,
  deleteDraftJournalBatchTx,
} from '../../lib/accounting/journal-service';
import {
  postStatementImportBatchToJournalTx,
  unpostStatementImportBatchTx,
} from '../../lib/imports/statement-import/posting-service';

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
      isStatementAccount: true,
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
    throw new Error('Failed to seed journal test accounts');
  }

  return { bankAccountId: bank.id, incomeAccountId: income.id, expenseAccountId: expense.id };
}

describe('core accounting: atomic + idempotent + concurrency-safe', () => {
  it('createPostedJournalBatch writes its audit row inside the same transaction', async () => {
    const publicId = crypto.randomUUID().replace(/-/g, '').slice(0, 5);
    const [org] = await db
      .insert(organizations)
      .values({
        publicId,
        name: `Test Org ${publicId}`,
      })
      .returning({ id: organizations.id });

    const [user] = await db
      .insert(users)
      .values({
        email: `${randomId('user')}@example.com`,
        passwordHash: 'test',
      })
      .returning({ id: users.id });
    if (!org || !user) {
      throw new Error('Failed to seed journal atomicity test org/user');
    }

    const [bank] = await db
      .insert(accounts)
      .values({
        orgId: org.id,
        code: String(Math.floor(Math.random() * 90000) + 10000),
        name: 'Bank',
        type: 'asset',
      })
      .returning({ id: accounts.id });

    const [income] = await db
      .insert(accounts)
      .values({
        orgId: org.id,
        code: String(Math.floor(Math.random() * 90000) + 10000),
        name: 'Income',
        type: 'income',
      })
      .returning({ id: accounts.id });
    if (!bank || !income) {
      throw new Error('Failed to seed journal atomicity test data');
    }

    await db.insert(members).values({
      userId: user.id,
      teamId: org.id,
      role: 'owner',
    });

    let batchId: string | null = null;

    try {
      const glDate = new Date('2026-03-01T00:00:00.000Z');
      const result = await createPostedJournalBatch({
        orgId: org.id,
        date: glDate,
        description: 'Posted journal with audit',
        createdByUserId: user.id,
        lines: [
          { accountId: bank.id, glDate, debit: 100_00, credit: 0 },
          { accountId: income.id, glDate, debit: 0, credit: 100_00 },
        ],
      });
      batchId = result.batchId;

      const auditRows = await db
        .select({ id: auditLog.id })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.orgId, org.id),
            eq(auditLog.entityType, 'journal_batch'),
            eq(auditLog.entityId, batchId),
            eq(auditLog.action, 'post'),
          ),
        );

      expect(auditRows).toHaveLength(1);
    } finally {
      if (batchId) {
        await db.delete(auditLog).where(eq(auditLog.entityId, batchId));
        await db.delete(journalLines).where(eq(journalLines.batchId, batchId));
        await db.delete(journalBatches).where(eq(journalBatches.id, batchId));
      }

      await db.delete(accounts).where(inArray(accounts.id, [bank.id, income.id]));
      await db.delete(members).where(eq(members.teamId, org.id));
      await db.delete(users).where(eq(users.id, user.id));
      await db.delete(organizations).where(eq(organizations.id, org.id));
    }
  });

  it('adjustJournalBatchTx returns the already-created revision on retry', async () => {
    await withRollback(async (tx) => {
      const { orgId, userId } = await seedOrgUser(tx);
      const { bankAccountId, incomeAccountId, expenseAccountId } = await seedAccounts(tx, orgId);

      const originalDate = new Date('2026-02-01T00:00:00.000Z');
      const { batchId: originalBatchId } = await createPostedJournalBatchTx(tx, {
        orgId,
        date: originalDate,
        description: 'Original',
        createdByUserId: userId,
        lines: [
          {
            accountId: bankAccountId,
            glDate: originalDate,
            debit: 10_000,
            credit: 0,
            narration: 'seed',
          },
          {
            accountId: incomeAccountId,
            glDate: originalDate,
            debit: 0,
            credit: 10_000,
            narration: 'seed',
          },
        ],
      });

      const revisedDate = new Date('2026-02-02T00:00:00.000Z');
      const revisedInput = {
        orgId,
        batchId: originalBatchId,
        userId,
        revised: {
          description: 'Revised',
          date: revisedDate,
          lines: [
            {
              accountId: bankAccountId,
              glDate: revisedDate,
              debit: 10_000,
              credit: 0,
              narration: 'bank',
            },
            {
              accountId: expenseAccountId,
              glDate: revisedDate,
              debit: 500,
              credit: 0,
              narration: 'adjustment',
            },
            {
              accountId: incomeAccountId,
              glDate: revisedDate,
              debit: 0,
              credit: 10_500,
              narration: 'income',
            },
          ],
        },
      };

      const first = await adjustJournalBatchTx(tx, revisedInput);
      const second = await adjustJournalBatchTx(tx, revisedInput);

      expect(second).toEqual(first);

      const postedChildren = await tx
        .select({ id: journalBatches.id })
        .from(journalBatches)
        .where(
          and(
            eq(journalBatches.orgId, orgId),
            eq(journalBatches.supersedesBatchId, originalBatchId),
            eq(journalBatches.status, 'posted'),
          ),
        );

      expect(postedChildren).toHaveLength(1);
      expect(postedChildren[0]?.id).toBe(first.revisedBatchId);
    });
  });

  it('adjustJournalBatchTx conflicts when a different payload races after a revision exists', async () => {
    await withRollback(async (tx) => {
      const { orgId, userId } = await seedOrgUser(tx);
      const { bankAccountId, incomeAccountId } = await seedAccounts(tx, orgId);

      const originalDate = new Date('2026-02-01T00:00:00.000Z');
      const { batchId: originalBatchId } = await createPostedJournalBatchTx(tx, {
        orgId,
        date: originalDate,
        description: 'Original',
        createdByUserId: userId,
        lines: [
          {
            accountId: bankAccountId,
            glDate: originalDate,
            debit: 10_000,
            credit: 0,
          },
          {
            accountId: incomeAccountId,
            glDate: originalDate,
            debit: 0,
            credit: 10_000,
          },
        ],
      });

      const revisedDate = new Date('2026-02-02T00:00:00.000Z');
      await adjustJournalBatchTx(tx, {
        orgId,
        batchId: originalBatchId,
        userId,
        revised: {
          description: 'Revised A',
          date: revisedDate,
          lines: [
            { accountId: bankAccountId, glDate: revisedDate, debit: 10_000, credit: 0 },
            { accountId: incomeAccountId, glDate: revisedDate, debit: 0, credit: 10_000 },
          ],
        },
      });

      await expect(
        adjustJournalBatchTx(tx, {
          orgId,
          batchId: originalBatchId,
          userId,
          revised: {
            description: 'Revised B (different)',
            date: revisedDate,
            lines: [
              { accountId: bankAccountId, glDate: revisedDate, debit: 9_999, credit: 0 },
              { accountId: incomeAccountId, glDate: revisedDate, debit: 0, credit: 9_999 },
            ],
          },
        }),
      ).rejects.toThrow(/edited elsewhere/i);
    });
  });

  it('adjustJournalBatchTx is atomic when run in a nested transaction (no partial reversal)', async () => {
    await withRollback(async (tx) => {
      const { orgId, userId } = await seedOrgUser(tx);
      const { bankAccountId, incomeAccountId } = await seedAccounts(tx, orgId);

      const originalDate = new Date('2026-02-01T00:00:00.000Z');
      const { batchId: originalBatchId } = await createPostedJournalBatchTx(tx, {
        orgId,
        date: originalDate,
        description: 'Original',
        createdByUserId: userId,
        lines: [
          { accountId: bankAccountId, glDate: originalDate, debit: 10_000, credit: 0 },
          { accountId: incomeAccountId, glDate: originalDate, debit: 0, credit: 10_000 },
        ],
      });

      const revisedDate = new Date('2026-02-02T00:00:00.000Z');

      await expect(
        tx.transaction(async (nestedTx) => {
          await adjustJournalBatchTx(nestedTx, {
            orgId,
            batchId: originalBatchId,
            userId,
            revised: {
              description: 'Invalid (unbalanced)',
              date: revisedDate,
              lines: [
                { accountId: bankAccountId, glDate: revisedDate, debit: 10_000, credit: 0 },
                { accountId: incomeAccountId, glDate: revisedDate, debit: 0, credit: 9_999 },
              ],
            },
          });
        }),
      ).rejects.toThrow(/not balanced|invalid/i);

      const reversalRows = await tx
        .select({ id: journalBatches.id })
        .from(journalBatches)
        .where(
          and(
            eq(journalBatches.orgId, orgId),
            eq(journalBatches.sourceType, 'adjustment_reversal'),
            eq(journalBatches.status, 'posted'),
          ),
        );

      expect(reversalRows).toHaveLength(0);
    });
  });

  it('deleteDraftJournalBatch removes draft lines before deleting the batch', async () => {
    await withRollback(async (tx) => {
      const { orgId, userId } = await seedOrgUser(tx);
      const { bankAccountId, incomeAccountId } = await seedAccounts(tx, orgId);

      const draftDate = new Date('2026-02-03T00:00:00.000Z');
      const { batchId } = await createDraftJournalBatchTx(tx, {
        orgId,
        date: draftDate,
        description: 'Draft to delete',
        createdByUserId: userId,
        lines: [
          { accountId: bankAccountId, glDate: draftDate, debit: 10_000, credit: 0 },
          { accountId: incomeAccountId, glDate: draftDate, debit: 0, credit: 10_000 },
        ],
      });

      await deleteDraftJournalBatchTx(tx, { orgId, batchId });

      const remainingBatches = await tx
        .select({ id: journalBatches.id })
        .from(journalBatches)
        .where(eq(journalBatches.id, batchId));
      const remainingLines = await tx
        .select({ id: journalLines.id })
        .from(journalLines)
        .where(eq(journalLines.batchId, batchId));

      expect(remainingBatches).toHaveLength(0);
      expect(remainingLines).toHaveLength(0);
    });
  });

  it('statement import post is atomic and idempotent (no-op on retry)', async () => {
    await withRollback(async (tx) => {
      const { orgId, userId } = await seedOrgUser(tx);
      const { bankAccountId, incomeAccountId, expenseAccountId } = await seedAccounts(tx, orgId);

      const importBatchId = crypto.randomUUID();
      const [statementImport] = await tx
        .insert(statementImports)
        .values({
          orgId,
          importBatchId,
          linkedAccountId: bankAccountId,
          fileName: 'statement.pdf',
          fileSize: 123,
          mimeType: 'application/pdf',
          sourceText: 'test',
          statementType: 'bank_statement',
          statementEndDate: new Date('2026-01-31T00:00:00.000Z'),
          status: 'extracted',
          uploadedBy: userId,
        })
        .returning({ id: statementImports.id });
      if (!statementImport) {
        throw new Error('Failed to seed statement import');
      }

      await tx.insert(parsedTransactions).values([
        {
          orgId,
          statementImportId: statementImport.id,
          transactionDate: new Date('2026-01-05T00:00:00.000Z'),
          description: 'Coffee',
          rawDescription: 'Coffee',
          normalizedDescription: 'coffee',
          amountCents: -5000,
          confirmedAccountId: expenseAccountId,
          allocations: null,
          isExcluded: false,
          journalBatchId: null,
          lineNumber: 1,
        },
        {
          orgId,
          statementImportId: statementImport.id,
          transactionDate: new Date('2026-01-06T00:00:00.000Z'),
          description: 'Sale',
          rawDescription: 'Sale',
          normalizedDescription: 'sale',
          amountCents: 10000,
          confirmedAccountId: incomeAccountId,
          allocations: null,
          isExcluded: false,
          journalBatchId: null,
          lineNumber: 2,
        },
      ]);

      const first = await postStatementImportBatchToJournalTx({
        tx,
        orgId,
        userId,
        batchOrImportId: importBatchId,
      });

      expect(first.batchId).toBeTruthy();
      expect(first.transactionCount).toBe(2);

      const second = await postStatementImportBatchToJournalTx({
        tx,
        orgId,
        userId,
        batchOrImportId: importBatchId,
      });

      expect(second).toEqual({ importBatchId, batchId: null, transactionCount: 0 });

      const postedBatches = await tx
        .select({ id: journalBatches.id })
        .from(journalBatches)
        .where(and(eq(journalBatches.orgId, orgId), eq(journalBatches.status, 'posted')));

      expect(postedBatches).toHaveLength(1);
      expect(postedBatches[0]?.id).toBe(first.batchId);

      const txRows = await tx
        .select({ id: parsedTransactions.id, journalBatchId: parsedTransactions.journalBatchId })
        .from(parsedTransactions)
        .where(eq(parsedTransactions.orgId, orgId));

      expect(txRows.every((row) => row.journalBatchId === first.batchId)).toBe(true);
    });
  });

  it('statement import unpost is atomic and idempotent (no-op on retry)', async () => {
    await withRollback(async (tx) => {
      const { orgId, userId } = await seedOrgUser(tx);
      const { bankAccountId, incomeAccountId } = await seedAccounts(tx, orgId);

      const importBatchId = crypto.randomUUID();
      const [statementImport] = await tx
        .insert(statementImports)
        .values({
          orgId,
          importBatchId,
          linkedAccountId: bankAccountId,
          fileName: 'statement.pdf',
          fileSize: 123,
          mimeType: 'application/pdf',
          sourceText: 'test',
          statementType: 'bank_statement',
          statementEndDate: new Date('2026-01-31T00:00:00.000Z'),
          status: 'extracted',
          uploadedBy: userId,
        })
        .returning({ id: statementImports.id });
      if (!statementImport) {
        throw new Error('Failed to seed statement import');
      }

      await tx.insert(parsedTransactions).values([
        {
          orgId,
          statementImportId: statementImport.id,
          transactionDate: new Date('2026-01-05T00:00:00.000Z'),
          description: 'Sale',
          rawDescription: 'Sale',
          normalizedDescription: 'sale',
          amountCents: 10000,
          confirmedAccountId: incomeAccountId,
          allocations: null,
          isExcluded: false,
          journalBatchId: null,
          lineNumber: 1,
        },
      ]);

      const postResult = await postStatementImportBatchToJournalTx({
        tx,
        orgId,
        userId,
        batchOrImportId: importBatchId,
      });

      expect(postResult.batchId).toBeTruthy();

      const first = await unpostStatementImportBatchTx({
        tx,
        orgId,
        userId,
        batchOrImportId: importBatchId,
      });

      expect(first.voidedBatchCount).toBe(1);
      expect(first.transactionCount).toBe(1);

      const batchesAfter = await tx
        .select({ id: journalBatches.id, status: journalBatches.status })
        .from(journalBatches)
        .where(
          and(eq(journalBatches.orgId, orgId), inArray(journalBatches.id, [postResult.batchId!])),
        );

      expect(batchesAfter[0]?.status).toBe('voided');

      const txRowsAfter = await tx
        .select({ id: parsedTransactions.id, journalBatchId: parsedTransactions.journalBatchId })
        .from(parsedTransactions)
        .where(eq(parsedTransactions.orgId, orgId));

      expect(txRowsAfter[0]?.journalBatchId).toBeNull();

      const second = await unpostStatementImportBatchTx({
        tx,
        orgId,
        userId,
        batchOrImportId: importBatchId,
      });

      expect(second).toEqual({ importBatchId, voidedBatchCount: 0, transactionCount: 0 });
    });
  });
});
