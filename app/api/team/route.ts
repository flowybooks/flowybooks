import { getTeamForUser } from '@/lib/db/queries';
import { toPublicTeam } from '@/lib/db/team-public';

export async function GET() {
  const team = await getTeamForUser();
  return Response.json(team ? toPublicTeam(team) : null);
}
