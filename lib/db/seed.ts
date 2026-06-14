import { db } from './drizzle';
import { users, organizations, members, accounts, journalBatches } from './schema';
import { generateUniqueTeamPublicId } from './team-public-id';
import { and, eq } from 'drizzle-orm';
import { createPostedJournalBatch } from '@/lib/accounting/journal-service';

async function seed() {
  const email = process.env.FLOWYBOOKS_SEED_EMAIL ?? ['local-seed', 'example.com'].join('@');

  console.log('Seeding database...');

  // 1. Ensure Test User
  let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    console.log('Creating test user...');
    [user] = await db
      .insert(users)
      .values({
        email: email,
        passwordHash: 'better-auth-managed',
        role: 'owner',
      })
      .returning();
  } else {
    console.log('Test user already exists.');
  }
  if (!user) {
    throw new Error('Failed to create or load seed user');
  }

  // 2. Ensure Test Organization
  let [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      createdAt: organizations.createdAt,
      updatedAt: organizations.updatedAt,
    })
    .from(organizations)
    .where(eq(organizations.name, 'Test Organization'))
    .limit(1);
  if (!org) {
    console.log('Creating test organization...');
    const publicId = await generateUniqueTeamPublicId();
    [org] = await db
      .insert(organizations)
      .values({
        publicId,
        name: 'Test Organization',
      })
      .returning();
  } else {
    console.log('Test organization already exists.');
  }
  if (!org) {
    throw new Error('Failed to create or load seed organization');
  }

  // 3. Ensure Membership
  const [member] = await db.select().from(members).where(eq(members.userId, user.id)).limit(1);

  if (!member) {
    console.log('Linking user to org...');
    await db.insert(members).values({
      teamId: org.id,
      userId: user.id,
      role: 'owner',
    });
  }

  // 4. Seed Chart of Accounts
  console.log('Checking Chart of Accounts...');
  const existingAccounts = await db.select().from(accounts).where(eq(accounts.orgId, org.id));

  if (existingAccounts.length === 0) {
    console.log('Seeding standard accounts...');
    const standardAccounts = [
      {
        code: '10000',
        name: 'Cash',
        type: 'asset',
        classification: 'current_asset',
        isStatementAccount: true,
      },
      {
        code: '12000',
        name: 'Accounts Receivable',
        type: 'asset',
        classification: 'current_asset',
        isStatementAccount: false,
      },
      {
        code: '20000',
        name: 'Accounts Payable',
        type: 'liability',
        classification: 'current_liability',
        isStatementAccount: true,
      },
      {
        code: '30000',
        name: 'Owner Equity',
        type: 'equity',
        classification: 'equity',
        isStatementAccount: false,
      },
      {
        code: '31000',
        name: 'Retained Earnings',
        type: 'equity',
        classification: 'equity',
        isStatementAccount: false,
      },
      {
        code: '40000',
        name: 'Sales Income',
        type: 'income',
        classification: 'other_income',
        isStatementAccount: false,
      },
      {
        code: '50000',
        name: 'Cost of Goods Sold',
        type: 'expense',
        classification: 'cogs',
        isStatementAccount: false,
      },
      {
        code: '60000',
        name: 'Operating Expense',
        type: 'expense',
        classification: 'other_expense',
        isStatementAccount: false,
      },
    ] as const;

    await db.insert(accounts).values(
      standardAccounts.map((acc) => ({
        orgId: org.id,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        classification: acc.classification,
        isActive: true,
        isStatementAccount: acc.isStatementAccount,
      })),
    );
    console.log(`Seeded ${standardAccounts.length} accounts.`);
  } else {
    console.log(`Accounts already exist (${existingAccounts.length}). Skipping seed.`);
  }

  // Ensure Retained Earnings account exists for this org
  const [retainedEarningsAccount] = await db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.orgId, org.id),
        eq(accounts.type, 'equity'),
        eq(accounts.name, 'Retained Earnings'),
      ),
    )
    .limit(1);

  if (!retainedEarningsAccount) {
    console.log('Adding Retained Earnings account for org...');
    await db.insert(accounts).values({
      orgId: org.id,
      code: '31000',
      name: 'Retained Earnings',
      type: 'equity',
      classification: 'equity',
      isActive: true,
    });
  }

  // 5. Seed a simple test journal
  console.log('Checking for existing journals...');
  const existingJournal = await db
    .select()
    .from(journalBatches)
    .where(eq(journalBatches.orgId, org.id))
    .limit(1);

  if (existingJournal.length === 0) {
    console.log('Seeding initial test journal...');

    const [cashAccount] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.orgId, org.id), eq(accounts.code, '10000')))
      .limit(1);

    const [salesAccount] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.orgId, org.id), eq(accounts.code, '40000')))
      .limit(1);

    if (!cashAccount || !salesAccount) {
      console.log('Required accounts not found; skipping journal seed.');
    } else {
      await createPostedJournalBatch({
        orgId: org.id,
        date: new Date(),
        description: 'Initial test journal',
        createdByUserId: user.id,
        lines: [
          {
            accountId: cashAccount.id,
            glDate: new Date(),
            debit: 100000, // $1,000.00 in cents
            credit: 0,
            narration: 'Initial cash',
          },
          {
            accountId: salesAccount.id,
            glDate: new Date(),
            debit: 0,
            credit: 100000,
            narration: 'Initial revenue',
          },
        ],
      });
      console.log('Seeded initial test journal.');
    }
  } else {
    console.log(`Journals already exist for org ${org.id}; skipping journal seed.`);
  }
}

seed()
  .catch((error) => {
    console.error('Seed process failed:', error);
    process.exit(1);
  })
  .finally(() => {
    console.log('Seed process finished. Exiting...');
    process.exit(0);
  });
