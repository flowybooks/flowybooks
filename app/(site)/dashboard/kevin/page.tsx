import {
  getKevinRuntimeStatus,
  getLatestKevinThreadSnapshot,
  listKevinActions,
} from '@/lib/kevin/service';
import { requireTeamRole } from '@/lib/auth/middleware';

import { KevinClient } from './kevin-client';

export default async function KevinPage() {
  const { team } = await requireTeamRole(['owner', 'member', 'advisor', 'bookkeeper']);
  const [status, actions, threadSnapshot] = await Promise.all([
    Promise.resolve(getKevinRuntimeStatus()),
    listKevinActions(team.id),
    getLatestKevinThreadSnapshot(team.id),
  ]);

  return (
    <section className="flex-1 p-4 lg:p-8">
      <KevinClient initialStatus={status} initialActions={actions} initialThread={threadSnapshot} />
    </section>
  );
}
