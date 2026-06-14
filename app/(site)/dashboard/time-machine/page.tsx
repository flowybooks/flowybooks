// This page renders the deterministic accounting Time Machine.
// It is org-scoped on the server and exposes restorable database checkpoints
// for the authenticated team without leaking snapshot payloads to the client.

import { requireTeamRole } from '@/lib/auth/middleware';
import { listTimeMachineEntries } from '@/lib/accounting/time-machine-service';

import { TimeMachineClient } from './time-machine-client';

export default async function TimeMachinePage() {
  const { team } = await requireTeamRole(['owner', 'member', 'advisor', 'bookkeeper']);
  const entries = await listTimeMachineEntries(team.id);

  return <TimeMachineClient initialEntries={entries} />;
}
