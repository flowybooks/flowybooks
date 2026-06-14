import Link from 'next/link';
import { getTeamForUser, getAccountsForTeam } from '@/lib/db/queries';
import { createPriorPeriodAdjustmentFromForm } from '../actions';
import { PriorPeriodAdjustmentForm } from './ppa-form';

const PROTECTED_NAMES = new Set([
  'Retained Earnings',
  'Opening Balance Equity',
  'Prior Period Adjustments',
]);

export default async function PriorPeriodAdjustmentPage() {
  const team = await getTeamForUser();

  if (!team) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="p-4 border rounded-md bg-muted/50 text-muted-foreground">
          Please create or select an organization to post adjustments.
        </div>
      </div>
    );
  }

  const accounts = await getAccountsForTeam(team.id);
  const selectableAccounts = accounts.filter(
    (acc) => !PROTECTED_NAMES.has(acc.name) && acc.type !== 'income' && acc.type !== 'expense',
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Prior Period Adjustment</h1>
          <p className="text-sm text-muted-foreground">
            Balance-sheet-only adjustments with an automatic plug to Prior Period Adjustments.
          </p>
        </div>
        <Link href="/dashboard/journal" className="text-sm text-muted-foreground hover:underline">
          Back to Journals
        </Link>
      </div>

      <PriorPeriodAdjustmentForm
        accounts={selectableAccounts.map((acc) => ({
          id: acc.id,
          code: acc.code,
          name: acc.name,
          type: acc.type,
        }))}
        action={createPriorPeriodAdjustmentFromForm}
      />
    </div>
  );
}
