// Returns Kevin runtime status and recent auditable actions for the current team.
// No provider secrets or raw prompts are exposed from this endpoint.
import { withApiTeamRole } from '@/lib/auth/api';
import { getKevinRuntimeStatus, listKevinActions } from '@/lib/kevin/service';

export const GET = withApiTeamRole(
  ['owner', 'member', 'advisor', 'bookkeeper'],
  async ({ team }) => {
    const [status, actions] = await Promise.all([
      Promise.resolve(getKevinRuntimeStatus()),
      listKevinActions(team.id),
    ]);

    return Response.json({ status, actions });
  },
);
