// This file handles "who is the current user?" database lookups.
// It turns the auth session into the app's SafeUser shape and helps
// routes and actions figure out which team the signed-in user belongs to.

import { and, asc, eq, isNull } from 'drizzle-orm';
import { cache } from 'react';

import { getBetterAuthSession } from '@/lib/auth/better-auth/session';

import { db } from '../drizzle';
import { members, users } from '../schema';

export type SafeUser = {
  id: number;
  email: string;
  name: string | null;
  role: string | null;
  currentOrgId: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

async function _getUser(): Promise<SafeUser | null> {
  const session = await getBetterAuthSession();
  if (!session?.user?.email) {
    return null;
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      currentOrgId: users.currentOrgId,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(and(eq(users.email, session.user.email), isNull(users.deletedAt)))
    .limit(1);

  return user ?? null;
}

export const getUser = cache(_getUser);

export const requireUser = cache(async () => {
  const user = await getUser();
  if (!user) {
    throw new Error('User is not authenticated');
  }
  return user;
});

export async function getUserWithTeam(userId: number) {
  const result = await db
    .select({
      user: users,
      teamId: members.teamId,
    })
    .from(users)
    .leftJoin(members, and(eq(users.id, members.userId), eq(members.teamId, users.currentOrgId)))
    .where(eq(users.id, userId))
    .limit(1);

  const row = result[0];
  if (!row) {
    return undefined;
  }

  if (row.teamId) {
    return row;
  }

  const [fallback] = await db
    .select({
      teamId: members.teamId,
    })
    .from(members)
    .where(eq(members.userId, userId))
    .orderBy(asc(members.joinedAt), asc(members.id))
    .limit(1);

  if (fallback?.teamId && row.user.currentOrgId !== fallback.teamId) {
    await db
      .update(users)
      .set({ currentOrgId: fallback.teamId, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  return {
    user: row.user,
    teamId: fallback?.teamId ?? null,
  };
}
