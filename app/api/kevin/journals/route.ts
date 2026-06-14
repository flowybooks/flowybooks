// Accepts validated Kevin journal proposals for explicit draft or post actions.
// Org scope and accounting safety checks are enforced in the service layer.
import { z } from 'zod';

import { apiError, withApiTeamRole } from '@/lib/auth/api';
import { createKevinJournalFromProposal } from '@/lib/kevin/service';
import { KevinJournalProposalSchema } from '@/lib/kevin/schemas';

const KevinJournalRequestSchema = z.object({
  threadId: z.string().uuid().optional().nullable(),
  status: z.enum(['draft', 'posted']),
  proposal: KevinJournalProposalSchema,
});

export const POST = withApiTeamRole(
  ['owner', 'member', 'advisor', 'bookkeeper'],
  async ({ user, team }, request) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError('Invalid JSON body', 400);
    }

    const parsed = KevinJournalRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? 'Invalid Kevin journal request', 400);
    }

    try {
      const result = await createKevinJournalFromProposal({
        orgId: team.id,
        userId: user.id,
        threadId: parsed.data.threadId ?? null,
        proposal: parsed.data.proposal,
        status: parsed.data.status,
      });

      return Response.json(result, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create Kevin journal';
      return apiError(message, 400);
    }
  },
);
