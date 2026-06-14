// Handles Kevin chat requests for the authenticated team context.
// The service layer performs provider routing, source gates, and journal safety checks.
import { z } from 'zod';

import { apiError, withApiTeamRole } from '@/lib/auth/api';
import { askKevin } from '@/lib/kevin/service';

export const runtime = 'nodejs';
export const maxDuration = 240;

const ChatRequestSchema = z.object({
  message: z.string().min(1).max(8_000),
  threadId: z.string().uuid().optional().nullable(),
  modelTier: z.enum(['small', 'medium', 'large']).optional().nullable(),
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

    const parsed = ChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? 'Invalid Kevin request', 400);
    }

    try {
      const result = await askKevin({
        orgId: team.id,
        userId: user.id,
        message: parsed.data.message,
        threadId: parsed.data.threadId,
        preferredModelTier: parsed.data.modelTier ?? undefined,
      });

      return Response.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kevin failed to answer';
      return apiError(message, 400);
    }
  },
);
