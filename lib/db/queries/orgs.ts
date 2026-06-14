// This file handles organization data plus org settings.
// Some function names still use "team" because the original access model did.

import { and, asc, eq } from 'drizzle-orm';
import { cache } from 'react';

import { createAuditEntry } from './audit';
import { getUser, requireUser } from './auth';
import { db } from '../drizzle';
import {
  members,
  organizations,
  orgSettings,
  users,
  type OrganizationDataWithMembers,
} from '../schema';

export type UserOrganization = {
  id: number;
  name: string;
  publicId: string | null;
  role: string;
};

export async function getTeamById(teamId: number) {
  const result = await db
    .select({
      id: organizations.id,
      publicId: organizations.publicId,
      name: organizations.name,
      taxId: organizations.taxId,
      domicileCountry: organizations.domicileCountry,
      createdAt: organizations.createdAt,
      updatedAt: organizations.updatedAt,
      fiscalYearEndMonth: organizations.fiscalYearEndMonth,
    })
    .from(organizations)
    .where(eq(organizations.id, teamId))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function updateTeamProfile(
  teamId: number,
  profile: {
    name: string;
    taxId?: string | null;
    domicileCountry?: string | null;
  },
) {
  await db
    .update(organizations)
    .set({
      name: profile.name,
      taxId: profile.taxId ?? null,
      domicileCountry: profile.domicileCountry ?? null,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, teamId));
}

async function _getTeamForUser(): Promise<OrganizationDataWithMembers | null> {
  const user = await getUser();
  if (!user) {
    return null;
  }

  const teamQuery = {
    columns: {
      id: true,
      publicId: true,
      name: true,
      taxId: true,
      domicileCountry: true,
      createdAt: true,
      updatedAt: true,
      fiscalYearEndMonth: true,
      metadata: true,
    },
    with: {
      members: {
        with: {
          user: {
            columns: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  } as const;

  if (user.currentOrgId) {
    const selected = await db.query.members.findFirst({
      where: and(eq(members.userId, user.id), eq(members.teamId, user.currentOrgId)),
      with: { team: teamQuery },
    });

    if (selected?.team) {
      return selected.team as OrganizationDataWithMembers;
    }
  }

  const fallback = await db.query.members.findFirst({
    where: eq(members.userId, user.id),
    orderBy: (members, { asc }) => [asc(members.joinedAt), asc(members.id)],
    with: { team: teamQuery },
  });

  if (fallback?.team && fallback.team.id !== user.currentOrgId) {
    await db
      .update(users)
      .set({ currentOrgId: fallback.team.id, updatedAt: new Date() })
      .where(eq(users.id, user.id));
  }

  return (fallback?.team as OrganizationDataWithMembers | undefined) ?? null;
}

export const getTeamForUser = cache(_getTeamForUser);

export async function getOrganizationsForUser(userId?: number): Promise<UserOrganization[]> {
  let resolvedUserId = userId;
  if (!resolvedUserId) {
    const user = await getUser();
    if (!user) {
      return [];
    }
    resolvedUserId = user.id;
  }

  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      publicId: organizations.publicId,
      role: members.role,
    })
    .from(members)
    .innerJoin(organizations, eq(members.teamId, organizations.id))
    .where(eq(members.userId, resolvedUserId))
    .orderBy(asc(organizations.name));

  return rows;
}

export const requireTeam = cache(async (): Promise<OrganizationDataWithMembers> => {
  const team = await getTeamForUser();
  if (!team) {
    throw new Error('Organization not found for current user');
  }
  return team;
});

export async function requireUserAndTeam() {
  const user = await requireUser();
  const team = await requireTeam();
  return { user, team };
}

export async function getOrgSettingsForTeam(
  teamId: number,
): Promise<typeof orgSettings.$inferSelect | null> {
  const [row] = await db.select().from(orgSettings).where(eq(orgSettings.orgId, teamId)).limit(1);
  return row ?? null;
}

export async function ensureOrgSettingsForTeam(
  teamId: number,
): Promise<typeof orgSettings.$inferSelect> {
  const existing = await getOrgSettingsForTeam(teamId);
  if (existing) {
    return existing;
  }

  const now = new Date();
  const [created] = await db
    .insert(orgSettings)
    .values({
      orgId: teamId,
      booksStartDate: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!created) {
    throw new Error('Unable to create organization settings.');
  }

  return created;
}

export async function setBooksStartDateForTeam(params: {
  teamId: number;
  booksStartDate: Date | null;
  userId?: number | undefined;
}) {
  const { teamId, booksStartDate, userId } = params;
  const existing = await ensureOrgSettingsForTeam(teamId);
  const now = new Date();

  const [updated] = await db
    .update(orgSettings)
    .set({
      booksStartDate,
      updatedAt: now,
    })
    .where(eq(orgSettings.id, existing.id))
    .returning();
  if (!updated) {
    throw new Error('Unable to update organization settings.');
  }

  if (userId) {
    await createAuditEntry({
      orgId: teamId,
      userId,
      entityType: 'org_settings',
      entityId: updated.id,
      action: 'update',
      previousState: existing,
      newState: updated,
      changeReason: 'booksStartDate updated',
      timestamp: now,
      source: 'web_ui',
    });
  }

  return updated;
}
