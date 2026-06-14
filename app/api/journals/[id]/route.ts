import { READ_TEAM_ROLES, withApiTeamRole } from '@/lib/auth/api';
import { getJournalBatchForTeam, getJournalLinesForBatch } from '@/lib/db/queries';
import { calculateJournalTotals } from '@/lib/accounting/journals';

export const GET = withApiTeamRole(
  READ_TEAM_ROLES,
  async ({ team }, _request, { params }: { params: Promise<{ id: string }> }) => {
    const { id: batchId } = await params;

    const batch = await getJournalBatchForTeam(team.id, batchId);

    if (!batch) {
      return Response.json({ error: 'Journal not found' }, { status: 404 });
    }

    const lines = await getJournalLinesForBatch(batchId, team.id);

    const totals = calculateJournalTotals(
      lines.map((line) => ({
        debit: line.debit,
        credit: line.credit,
      })),
    );

    return Response.json({
      batch,
      lines,
      totals,
    });
  },
);
