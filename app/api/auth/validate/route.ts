// This route returns the current auth session plus the active organization.
// Local-first builds validate only auth and organization state.

import { NextResponse } from 'next/server';
import { getTeamForUser, getUser } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const team = await getTeamForUser();
  if (!team) {
    return NextResponse.json(
      {
        authenticated: true,
        allowed: false,
        reason: 'no_team',
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    authenticated: true,
    allowed: true,
    reason: 'local_org_access',
    teamPublicId: team.publicId,
  });
}
