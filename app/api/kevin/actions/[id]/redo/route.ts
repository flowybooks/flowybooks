// Replays a previously undone Kevin action within the authenticated team.
// Redo creates a fresh audited journal action rather than mutating history.
import { apiError, withApiTeamRole } from '@/lib/auth/api';
import { redoKevinAction } from '@/lib/kevin/service';

export const POST = withApiTeamRole(
  ['owner', 'member', 'advisor', 'bookkeeper'],
  async ({ user, team }, _request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;

    try {
      const result = await redoKevinAction({
        orgId: team.id,
        userId: user.id,
        actionId: id,
      });

      return Response.json(result, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to redo Kevin action';
      return apiError(message, 400);
    }
  },
);
