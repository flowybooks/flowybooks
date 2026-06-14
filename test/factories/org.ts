import { db } from '@/lib/db/drizzle';
import { accounts, members, organizations, users } from '@/lib/db/schema';

type TestAccountInput = {
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  classification?: (typeof accounts.$inferInsert)['classification'];
  isStatementAccount?: boolean;
};

export function randomTestId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

export async function createTestOrg() {
  const publicId = crypto.randomUUID().replace(/-/g, '').slice(0, 5);
  const [org] = await db
    .insert(organizations)
    .values({ publicId, name: `Flowybooks Test Org ${publicId}` })
    .returning();
  if (!org) {
    throw new Error('Expected test organization to be created.');
  }

  return org;
}

export async function createTestUser() {
  const [user] = await db
    .insert(users)
    .values({
      email: `${randomTestId('user')}@example.com`,
      passwordHash: 'test',
    })
    .returning();
  if (!user) {
    throw new Error('Expected test user to be created.');
  }

  return user;
}

export async function createTestOrgWithUser(role: (typeof members.$inferInsert)['role'] = 'owner') {
  const org = await createTestOrg();
  const user = await createTestUser();

  await db.insert(members).values({
    userId: user.id,
    teamId: org.id,
    role,
  });

  return { org, user, orgId: org.id, userId: user.id };
}

export async function createTestAccounts(orgId: number, accountInputs: TestAccountInput[]) {
  return db
    .insert(accounts)
    .values(
      accountInputs.map((account) => ({
        orgId,
        code: account.code,
        name: account.name,
        type: account.type,
        classification: account.classification,
        isStatementAccount: account.isStatementAccount ?? false,
      })),
    )
    .returning();
}
