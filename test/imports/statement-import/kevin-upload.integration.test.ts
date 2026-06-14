import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

vi.mock('server-only', () => ({}));

import { db } from '@/lib/db/drizzle';
import {
  accounts,
  members,
  organizations,
  parsedTransactions,
  statementImports,
  users,
} from '@/lib/db/schema';
import {
  processSpreadsheetStatementImport,
  uploadStatement,
} from '@/lib/imports/statement-import/statement-import-service';

const AI_ENV_KEYS = ['AI_PROVIDER', 'OPENAI_API_KEY', 'OLLAMA_BASE_URL', 'OLLAMA_MODEL'] as const;
const originalAiEnv = AI_ENV_KEYS.reduce<Record<string, string | undefined>>((acc, key) => {
  acc[key] = process.env[key];
  return acc;
}, {});

beforeEach(() => {
  for (const key of AI_ENV_KEYS) {
    delete process.env[key];
  }
});

afterEach(() => {
  for (const [key, value] of Object.entries(originalAiEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

function randomId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

async function seedOrgUserAndStatementAccounts() {
  const publicId = crypto.randomUUID().replace(/-/g, '').slice(0, 5);
  const [org] = await db
    .insert(organizations)
    .values({ publicId, name: `Kevin Upload Test ${publicId}` })
    .returning({ id: organizations.id });

  const [user] = await db
    .insert(users)
    .values({
      email: `${randomId('kevin_upload')}@example.com`,
      passwordHash: 'test',
    })
    .returning({ id: users.id });
  if (!org || !user) {
    throw new Error('Failed to seed Kevin upload test org/user');
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
        code: '11000',
        name: 'Operating Checking',
        type: 'asset',
        isStatementAccount: true,
      },
      {
        orgId: org.id,
        code: '21050',
        name: 'Credit Card Payable',
        type: 'liability',
        isStatementAccount: true,
      },
    ])
    .returning();

  return {
    orgId: org.id,
    userId: user.id,
    accounts: seededAccounts,
  };
}

async function cleanup(orgId?: number, userId?: number) {
  if (orgId) {
    await db.delete(parsedTransactions).where(eq(parsedTransactions.orgId, orgId));
    await db.delete(statementImports).where(eq(statementImports.orgId, orgId));
    await db.delete(accounts).where(eq(accounts.orgId, orgId));
    await db.delete(members).where(eq(members.teamId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }

  if (userId) {
    await db.delete(users).where(eq(users.id, userId));
  }
}

function csvFile(name: string, content: string) {
  return new File([content], name, { type: 'text/csv' });
}

describe('Kevin statement upload service flow', () => {
  it('classifies a Kevin upload without parsing CSV transactions when processing is disabled', async () => {
    let orgId: number | undefined;
    let userId: number | undefined;

    try {
      const seeded = await seedOrgUserAndStatementAccounts();
      orgId = seeded.orgId;
      userId = seeded.userId;

      const result = await uploadStatement({
        orgId,
        userId,
        file: csvFile(
          'bank statement operating checking account deposits withdrawals.csv',
          'Date,Description,Amount\n2026-06-01,Deposit,100.00\n',
        ),
        importBatchId: crypto.randomUUID(),
        classificationMode: 'auto',
        accounts: seeded.accounts,
        processSpreadsheetOnUpload: false,
      });

      expect(result.statementImport.status).toBe('uploaded');
      expect(result.statementImport.statementType).toBe('bank_statement');
      expect(result.statementImport.linkedAccountId).toBe(seeded.accounts[0]?.id);
      expect(result.classification).toMatchObject({
        detectedStatementType: 'bank_statement',
        confidence: 'high',
        accountMatchStatus: 'matched',
      });

      const txRows = await db
        .select({ id: parsedTransactions.id })
        .from(parsedTransactions)
        .where(eq(parsedTransactions.statementImportId, result.statementImport.id));

      expect(txRows).toHaveLength(0);
    } finally {
      await cleanup(orgId, userId);
    }
  });

  it('processes stored Kevin CSV text only when deterministic spreadsheet processing is invoked', async () => {
    let orgId: number | undefined;
    let userId: number | undefined;

    try {
      const seeded = await seedOrgUserAndStatementAccounts();
      orgId = seeded.orgId;
      userId = seeded.userId;

      const uploaded = await uploadStatement({
        orgId,
        userId,
        file: csvFile(
          'bank statement operating checking account deposits withdrawals.csv',
          'Date,Description,Amount\n2026-06-01,Deposit,100.00\n2026-06-02,Rent,-50.00\n',
        ),
        importBatchId: crypto.randomUUID(),
        classificationMode: 'auto',
        accounts: seeded.accounts,
        processSpreadsheetOnUpload: false,
      });

      const processed = await processSpreadsheetStatementImport({
        orgId,
        statementImportId: uploaded.statementImport.id,
      });

      expect(processed.statementImport.status).toBe('extracted');
      expect(processed.transactionCount).toBe(2);

      const txRows = await db
        .select({ id: parsedTransactions.id })
        .from(parsedTransactions)
        .where(eq(parsedTransactions.statementImportId, uploaded.statementImport.id));

      expect(txRows).toHaveLength(2);
    } finally {
      await cleanup(orgId, userId);
    }
  });
});
