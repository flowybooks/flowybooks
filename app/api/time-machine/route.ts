// Returns deterministic Time Machine checkpoints for the current team.
// Snapshot payloads stay server-side; the dashboard receives only restore
// metadata needed for an explicit user-selected restore.

import { withApiTeamRole } from '@/lib/auth/api';
import { listTimeMachineEntries } from '@/lib/accounting/time-machine-service';

export const GET = withApiTeamRole(
  ['owner', 'member', 'advisor', 'bookkeeper'],
  async ({ team }) => {
    const entries = await listTimeMachineEntries(team.id);
    return Response.json({ entries });
  },
);
