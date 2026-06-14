'use server';

import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  User,
  users,
  members,
  activityLogs,
  ActivityType,
  type NewActivityLog,
} from '@/lib/db/schema';
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { getUser, getUserWithTeam } from '@/lib/db/queries';
import { validatedActionWithUser } from '@/lib/auth/middleware';
import { getBetterAuth } from '@/lib/auth/better-auth/server';

async function logActivity(
  teamId: number | null | undefined,
  userId: number,
  type: ActivityType,
  ipAddress?: string,
) {
  if (teamId === null || teamId === undefined) {
    return;
  }
  const newActivity: NewActivityLog = {
    teamId,
    userId,
    action: type,
    ipAddress: ipAddress || '',
  };
  await db.insert(activityLogs).values(newActivity);
}

function getAuthErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === 'object') {
    const nestedMessage = (error as { error?: { message?: unknown }; message?: unknown }).error
      ?.message;
    if (typeof nestedMessage === 'string' && nestedMessage) {
      return nestedMessage;
    }

    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) {
      return message;
    }
  }

  return fallback;
}

export async function signOut() {
  const user = (await getUser()) as User | null;
  if (user) {
    const userWithTeam = await getUserWithTeam(user.id);
    await logActivity(userWithTeam?.teamId, user.id, ActivityType.SIGN_OUT);
  }

  // Clear Better Auth session
  const auth = await getBetterAuth();
  await auth.api.signOut({ headers: await headers() });
  (await cookies()).delete('session');

  redirect('/sign-in');
}

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(100),
  newPassword: z.string().min(8).max(100),
  confirmPassword: z.string().min(8).max(100),
});

export const updatePassword = validatedActionWithUser(
  updatePasswordSchema,
  async (data, _, user) => {
    const { currentPassword, newPassword, confirmPassword } = data;

    if (confirmPassword !== newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'New password and confirmation password do not match.',
      };
    }

    try {
      const auth = await getBetterAuth();
      await auth.api.changePassword({
        body: {
          currentPassword,
          newPassword,
        },
        headers: await headers(),
      });

      const userWithTeam = await getUserWithTeam(user.id);
      await logActivity(userWithTeam?.teamId, user.id, ActivityType.UPDATE_PASSWORD);

      return {
        success: 'Password updated successfully.',
      };
    } catch (err: unknown) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: getAuthErrorMessage(err, 'Password update failed.'),
      };
    }
  },
);

const deleteAccountSchema = z.object({
  password: z.string().min(8).max(100),
});

export const deleteAccount = validatedActionWithUser(deleteAccountSchema, async (data, _, user) => {
  const { password } = data;

  try {
    const auth = await getBetterAuth();
    await auth.api.deleteUser({
      body: { password },
      headers: await headers(),
    });
  } catch (err: unknown) {
    return {
      password,
      error: getAuthErrorMessage(err, 'Account deletion failed.'),
    };
  }

  const userWithTeam = await getUserWithTeam(user.id);

  await logActivity(userWithTeam?.teamId, user.id, ActivityType.DELETE_ACCOUNT);

  // Soft delete
  await db
    .update(users)
    .set({
      deletedAt: sql`CURRENT_TIMESTAMP`,
      email: sql`CONCAT(email, '-', id, '-deleted')`, // Ensure email uniqueness
    })
    .where(eq(users.id, user.id));

  if (userWithTeam?.teamId) {
    await db
      .delete(members)
      .where(and(eq(members.userId, user.id), eq(members.teamId, userWithTeam.teamId)));
  }

  (await cookies()).delete('session');
  redirect('/sign-in');
});

const updateAccountSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
});

export const updateAccount = validatedActionWithUser(updateAccountSchema, async (data, _, user) => {
  const { name, email } = data;
  const userWithTeam = await getUserWithTeam(user.id);

  if (email !== user.email) {
    return {
      name,
      error: 'Email changes are not supported yet. Contact support for help.',
    };
  }

  try {
    const auth = await getBetterAuth();
    await auth.api.updateUser({
      body: { name },
      headers: await headers(),
    });
  } catch (err: unknown) {
    return {
      name,
      error: getAuthErrorMessage(err, 'Account update failed.'),
    };
  }

  await Promise.all([
    db.update(users).set({ name }).where(eq(users.id, user.id)),
    logActivity(userWithTeam?.teamId, user.id, ActivityType.UPDATE_ACCOUNT),
  ]);

  return { name, success: 'Account updated successfully.' };
});
