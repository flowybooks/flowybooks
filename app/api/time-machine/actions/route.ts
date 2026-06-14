// Executes deterministic Time Machine checkpoint actions for the current team.
// Restore is org-scoped and replaces mutable bookkeeping/workflow state from
// a saved checkpoint while preserving users, memberships, audit, and snapshots.

import { z } from 'zod';

import {
  createTimeMachineSnapshot,
  restoreTimeMachineSnapshot,
} from '@/lib/accounting/time-machine-service';
import { apiError, withApiTeamRole } from '@/lib/auth/api';

const TimeMachineActionSchema = z.object({
  entryId: z.string().min(1).optional(),
  operation: z.enum(['snapshot', 'restore']),
});

function parseSnapshotEntryId(entryId: string | undefined): string {
  if (!entryId) {
    throw new Error('Time Machine checkpoint is required');
  }

  const separator = entryId.indexOf(':');
  if (separator <= 0) {
    throw new Error('Invalid Time Machine checkpoint');
  }

  const source = entryId.slice(0, separator);
  const id = entryId.slice(separator + 1);
  if (source !== 'snapshot' || !id) {
    throw new Error('Invalid Time Machine checkpoint');
  }

  return id;
}

export const POST = withApiTeamRole(
  ['owner', 'member', 'advisor', 'bookkeeper'],
  async ({ user, team }, request) => {
    const parsed = TimeMachineActionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? 'Invalid Time Machine action', 400);
    }

    try {
      if (parsed.data.operation === 'snapshot') {
        const result = await createTimeMachineSnapshot({
          orgId: team.id,
          userId: user.id,
          label: 'Manual checkpoint',
          description: 'Captured from Time Machine.',
          reason: 'manual',
          sourceType: 'time_machine',
        });

        return Response.json({ result }, { status: 201 });
      }

      const snapshotId = parseSnapshotEntryId(parsed.data.entryId);
      const result = await restoreTimeMachineSnapshot({
        orgId: team.id,
        userId: user.id,
        snapshotId,
      });

      return Response.json({ result }, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to run Time Machine action';
      return apiError(message, 400);
    }
  },
);
