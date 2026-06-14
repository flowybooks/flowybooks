import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { db } from '../../lib/db/drizzle';
import { ensureSystemEquityAccounts } from '../../lib/db/queries/accounts';
import { accounts, organizations } from '../../lib/db/schema';

describe('system equity accounts', () => {
  it('repairs legacy Opening Balance Equity classification drift', async () => {
    const publicId = crypto.randomUUID().replace(/-/g, '').slice(0, 5);
    const [org] = await db
      .insert(organizations)
      .values({
        publicId,
        name: `System Equity Repair ${publicId}`,
      })
      .returning({ id: organizations.id });
    if (!org) {
      throw new Error('Failed to seed system equity test org');
    }

    try {
      const [openingBalanceEquity] = await db
        .insert(accounts)
        .values({
          orgId: org.id,
          code: '32000',
          name: 'Opening Balance Equity',
          type: 'equity',
          classification: 'equity',
          isActive: false,
          isStatementAccount: true,
        })
        .returning({ id: accounts.id });
      if (!openingBalanceEquity) {
        throw new Error('Failed to seed Opening Balance Equity account');
      }

      const ids = await ensureSystemEquityAccounts(org.id);

      expect(ids.openingBalanceEquityAccountId).toBe(openingBalanceEquity.id);

      const repairedRows = await db
        .select({
          classification: accounts.classification,
          isActive: accounts.isActive,
          isStatementAccount: accounts.isStatementAccount,
        })
        .from(accounts)
        .where(eq(accounts.id, openingBalanceEquity.id));

      expect(repairedRows[0]).toEqual({
        classification: 'other_equity',
        isActive: true,
        isStatementAccount: false,
      });
      expect(ids.priorPeriodAdjustmentsAccountId).toEqual(expect.any(String));
    } finally {
      await db.delete(accounts).where(eq(accounts.orgId, org.id));
      await db.delete(organizations).where(eq(organizations.id, org.id));
    }
  });
});
