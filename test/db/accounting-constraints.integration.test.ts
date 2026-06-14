import { describe, expect, it } from 'vitest';

import { db } from '@/lib/db/drizzle';
import { accounts, journalBatches, journalLines, organizations } from '@/lib/db/schema';
import { cleanupOrg } from '@/test/factories/cleanup';
import { createTestAccounts, createTestOrg, randomTestId } from '@/test/factories/org';

describe('database accounting constraints', () => {
  it('rejects invalid account codes and journal line amounts at the database layer', async () => {
    const org = await createTestOrg();

    try {
      await expect(
        db.insert(accounts).values({
          orgId: org.id,
          code: '10A00',
          name: 'Bad Account Code',
          type: 'asset',
        }),
      ).rejects.toThrow();

      const [bank, revenue] = await createTestAccounts(org.id, [
        { code: '10000', name: 'Bank', type: 'asset' },
        { code: '40000', name: 'Revenue', type: 'income' },
      ]);
      if (!bank || !revenue) {
        throw new Error('Expected test accounts to be created.');
      }

      const [batch] = await db
        .insert(journalBatches)
        .values({
          orgId: org.id,
          date: new Date('2026-01-01T00:00:00.000Z'),
          description: 'Constraint test batch',
          status: 'draft',
        })
        .returning({ id: journalBatches.id });
      if (!batch) {
        throw new Error('Expected test journal batch to be created.');
      }

      const baseLine = {
        orgId: org.id,
        batchId: batch.id,
        accountId: bank.id,
        glDate: new Date('2026-01-01T00:00:00.000Z'),
      };

      await expect(
        db.insert(journalLines).values({ ...baseLine, debit: -1, credit: 0 }),
      ).rejects.toThrow();

      await expect(
        db.insert(journalLines).values({ ...baseLine, debit: 100, credit: 100 }),
      ).rejects.toThrow();

      await expect(
        db.insert(journalLines).values({ ...baseLine, debit: 0, credit: 0 }),
      ).rejects.toThrow();

      await expect(
        db.insert(journalLines).values({
          ...baseLine,
          accountId: revenue.id,
          debit: 0,
          credit: 100,
        }),
      ).resolves.toBeDefined();
    } finally {
      await cleanupOrg(org.id);
    }
  });

  it('rejects fiscal-year-end months outside the 1-12 range', async () => {
    await expect(
      db.insert(organizations).values({
        publicId: crypto.randomUUID().replace(/-/g, '').slice(0, 5),
        name: randomTestId('invalid_fiscal_month'),
        fiscalYearEndMonth: 13,
      }),
    ).rejects.toThrow();
  });
});
