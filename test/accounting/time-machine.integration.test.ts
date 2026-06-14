import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import {
  createTimeMachineSnapshot,
  listTimeMachineEntries,
  restoreTimeMachineSnapshot,
} from '../../lib/accounting/time-machine-service';
import { db } from '../../lib/db/drizzle';
import { accounts, members, organizations, timeMachineSnapshots, users } from '../../lib/db/schema';

function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

async function cleanup(params: { orgId?: number; userId?: number }) {
  if (params.orgId) {
    await db.delete(timeMachineSnapshots).where(eq(timeMachineSnapshots.orgId, params.orgId));
    await db.delete(accounts).where(eq(accounts.orgId, params.orgId));
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
    .values({ publicId, name: `Time Machine Test Org ${publicId}` })
    .returning({ id: organizations.id });

  const [user] = await db
    .insert(users)
    .values({
      email: `${randomId('time_machine_user')}@example.com`,
      passwordHash: 'test',
    })
    .returning({ id: users.id });
  if (!org || !user) {
    throw new Error('Failed to seed Time Machine test org/user');
  }

  await db.insert(members).values({
    userId: user.id,
    teamId: org.id,
    role: 'owner',
  });

  await db.insert(accounts).values([
    {
      orgId: org.id,
      code: '10000',
      name: 'Checking',
      type: 'asset',
    },
    {
      orgId: org.id,
      code: '40000',
      name: 'Service Revenue',
      type: 'income',
    },
  ]);

  return {
    orgId: org.id,
    userId: user.id,
  };
}

async function accountNames(orgId: number): Promise<string[]> {
  const rows = await db
    .select({ name: accounts.name })
    .from(accounts)
    .where(eq(accounts.orgId, orgId));
  return rows.map((row) => row.name).sort();
}

describe('Time Machine checkpoints', () => {
  it('restores org bookkeeping state from a checkpoint and creates a safety checkpoint', async () => {
    let orgId: number | undefined;
    let userId: number | undefined;

    try {
      const seeded = await seedOrgUserAndAccounts();
      orgId = seeded.orgId;
      userId = seeded.userId;

      const baseline = await createTimeMachineSnapshot({
        orgId,
        userId,
        label: 'Baseline chart',
        description: 'Before inventory account is added.',
        reason: 'manual',
      });

      await db.insert(accounts).values({
        orgId,
        code: '14000',
        name: 'Inventory',
        type: 'asset',
        classification: 'current_asset',
      });

      expect(await accountNames(orgId)).toEqual(['Checking', 'Inventory', 'Service Revenue']);

      let entries = await listTimeMachineEntries(orgId);
      expect(entries.find((entry) => entry.entryId === baseline.entryId)).toMatchObject({
        canRestore: true,
        title: 'Baseline chart',
      });

      const restored = await restoreTimeMachineSnapshot({
        orgId,
        userId,
        snapshotId: baseline.snapshotId,
      });

      expect(restored.action).toBe('restore');
      expect(restored.safetySnapshotId).toBeDefined();
      expect(await accountNames(orgId)).toEqual(['Checking', 'Service Revenue']);

      entries = await listTimeMachineEntries(orgId);
      const safetyEntry = entries.find((entry) => entry.snapshotId === restored.safetySnapshotId);
      expect(safetyEntry).toMatchObject({
        kind: 'restore_safety',
        canRestore: true,
      });

      await restoreTimeMachineSnapshot({
        orgId,
        userId,
        snapshotId: restored.safetySnapshotId!,
      });

      expect(await accountNames(orgId)).toEqual(['Checking', 'Inventory', 'Service Revenue']);
    } finally {
      if (orgId !== undefined && userId !== undefined) {
        await cleanup({ orgId, userId });
      } else {
        await cleanup({});
      }
    }
  });
});
