import { READ_TEAM_ROLES, withApiTeamRole } from '@/lib/auth/api';
import { getJournalBatchesForTeam } from '@/lib/db/queries';

export const GET = withApiTeamRole(READ_TEAM_ROLES, async ({ team }) => {
  const batches = await getJournalBatchesForTeam(team.id);

  return Response.json(batches);
});
