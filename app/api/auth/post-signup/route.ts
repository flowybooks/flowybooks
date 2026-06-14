// This route finalizes local signup by creating or joining an organization.
// It also provisions default org settings for the bookkeeping workspace.

import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { getBetterAuthSession } from '@/lib/auth/better-auth/session';
import { db } from '@/lib/db/drizzle';
import { ActivityType, activityLogs, members, organizations, users } from '@/lib/db/schema';
import { ensureOrgSettingsForTeam } from '@/lib/db/queries';
import { generateUniqueTeamPublicId } from '@/lib/db/team-public-id';
import { createSlidingWindowRateLimiter } from '@/lib/rate-limit';

const postSignupRateLimiter = createSlidingWindowRateLimiter({
  windowMs: 10 * 60_000,
  max: 10,
});

export async function POST(request: Request) {
  const session = await getBetterAuthSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const nowMs = Date.now();
  const rateLimit = postSignupRateLimiter.consume(
    `auth.post-signup:${session.user.email}:${clientIp}`,
    nowMs,
  );
  if (!rateLimit.allowed) {
    const retryAfterSeconds = Math.max(1, Math.ceil((rateLimit.resetAtMs - nowMs) / 1000));
    return NextResponse.json(
      { error: 'Too many requests. Please try again shortly.' },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfterSeconds) },
      },
    );
  }

  const { teamName, taxId, domicileCountry } = await request.json().catch(() => ({}));
  const email = session.user.email;
  const name = session.user.name ?? '';
  const ipAddress = clientIp === 'unknown' ? '' : clientIp;

  const [existingUser] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  let userId = existingUser?.id ?? null;
  const createdUser = !existingUser;

  if (!existingUser) {
    const [created] = await db
      .insert(users)
      .values({
        email,
        name,
        passwordHash: 'better-auth-managed',
        role: 'owner',
      })
      .returning();
    if (!created) {
      return NextResponse.json({ error: 'Unable to create user.' }, { status: 500 });
    }
    userId = created.id;
  }

  let teamId: number | null = null;

  if (!teamId && userId !== null) {
    const [existingMember] = await db
      .select()
      .from(members)
      .where(eq(members.userId, userId))
      .limit(1);
    if (existingMember) {
      teamId = existingMember.teamId;
    }
  }

  if (!teamId) {
    const cleanedTeamName = typeof teamName === 'string' ? teamName.trim() : '';
    const cleanedTaxId = typeof taxId === 'string' ? taxId.trim() : '';
    const cleanedCountry = typeof domicileCountry === 'string' ? domicileCountry.trim() : '';
    let publicId = await generateUniqueTeamPublicId();
    let org: typeof organizations.$inferSelect | undefined;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const [created] = await db
          .insert(organizations)
          .values({
            publicId,
            name: cleanedTeamName || `${name || email}'s Organization`,
            taxId: cleanedTaxId || null,
            domicileCountry: cleanedCountry || null,
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
    teamId = org.id;
  }

  if (userId === null || teamId === null) {
    return NextResponse.json({ error: 'Unable to create user or organization.' }, { status: 500 });
  }

  const [memberRecord] = await db
    .select()
    .from(members)
    .where(and(eq(members.userId, userId), eq(members.teamId, teamId)))
    .limit(1);

  if (!memberRecord) {
    await db.insert(members).values({
      userId,
      teamId,
      role: 'owner',
    });
  }

  const shouldSetCurrentOrg = createdUser || existingUser?.currentOrgId == null;
  if (shouldSetCurrentOrg) {
    await db
      .update(users)
      .set({ currentOrgId: teamId, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  await ensureOrgSettingsForTeam(teamId);

  await db.insert(activityLogs).values({
    teamId,
    userId,
    action: createdUser ? ActivityType.SIGN_UP : ActivityType.SIGN_IN,
    ipAddress,
  });

  return NextResponse.json({ success: true, userId, teamId, createdUser });
}
