import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { ensureOrgSettingsForTeam, getOrganizationsForUser, getUser } from '@/lib/db/queries';
import { members, organizations, users } from '@/lib/db/schema';
import { generateUniqueTeamPublicId } from '@/lib/db/team-public-id';

export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const orgs = await getOrganizationsForUser(user.id);

  return NextResponse.json({
    currentOrgId: user.currentOrgId,
    orgs,
  });
}

export async function PATCH(request: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { orgId } = await request.json().catch(() => ({}));
  const orgIdNumber = Number(orgId);
  if (!Number.isFinite(orgIdNumber)) {
    return NextResponse.json({ error: 'Invalid organization.' }, { status: 400 });
  }

  const [membership] = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.userId, user.id), eq(members.teamId, orgIdNumber)))
    .limit(1);

  if (!membership) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  await db
    .update(users)
    .set({ currentOrgId: orgIdNumber, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return NextResponse.json({ currentOrgId: orgIdNumber });
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { name } = await request.json().catch(() => ({}));
  const trimmedName = typeof name === 'string' ? name.trim() : '';

  if (trimmedName.length < 2) {
    return NextResponse.json(
      { error: 'Organization name must be at least 2 characters.' },
      { status: 400 },
    );
  }
  if (trimmedName.length > 100) {
    return NextResponse.json(
      { error: 'Organization name must be 100 characters or less.' },
      { status: 400 },
    );
  }

  let publicId = await generateUniqueTeamPublicId();
  let org: typeof organizations.$inferSelect | undefined;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const [created] = await db
        .insert(organizations)
        .values({
          publicId,
          name: trimmedName,
        })
        .returning();
      org = created;
      break;
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error) {
        if ((error as { code?: string }).code === '23505') {
          publicId = await generateUniqueTeamPublicId();
          continue;
        }
      }
      throw error;
    }
  }

  if (!org) {
    return NextResponse.json({ error: 'Unable to create organization.' }, { status: 500 });
  }

  await db.insert(members).values({
    teamId: org.id,
    userId: user.id,
    role: 'owner',
  });

  await ensureOrgSettingsForTeam(org.id);

  await db
    .update(users)
    .set({ currentOrgId: org.id, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return NextResponse.json({
    id: org.id,
    name: org.name,
    publicId: org.publicId,
  });
}
