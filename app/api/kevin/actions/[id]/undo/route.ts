// Creates an auditable undo for a Kevin action within the authenticated team.
// Posted journals are reversed; unchanged Kevin drafts may be deleted.
import { apiError, withApiTeamRole } from '@/lib/auth/api';
import { undoKevinAction } from '@/lib/kevin/service';

export const POST = withApiTeamRole(
  ['owner', 'member', 'advisor', 'bookkeeper'],
  async ({ user, team }, _request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;

    try {
      const result = await undoKevinAction({
        orgId: team.id,
        userId: user.id,
        actionId: id,
      });

      return Response.json(result, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to undo Kevin action';
      return apiError(message, 400);
    }
  },
);
