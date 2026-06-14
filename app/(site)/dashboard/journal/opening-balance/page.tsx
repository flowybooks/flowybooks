import Link from 'next/link';
import { getTeamForUser, getAccountsForTeam } from '@/lib/db/queries';
import { createOpeningBalanceFromCsv, createOpeningBalanceFromForm } from '../actions';
import { OpeningBalanceForm } from './opening-balance-form';
import { OpeningBalanceCsvForm } from './opening-balance-csv-form';

const PROTECTED_NAMES = new Set([
  'Retained Earnings',
  'Opening Balance Equity',
  'Prior Period Adjustments',
]);

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OpeningBalancePage({ searchParams }: PageProps) {
  const paramsData = searchParams ? await searchParams : undefined;
  const errorParam = paramsData?.error;
  const errorMessage =
    typeof errorParam === 'string'
      ? errorParam
      : Array.isArray(errorParam)
        ? errorParam[0]
        : undefined;

  const team = await getTeamForUser();

  if (!team) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="p-4 border rounded-md bg-muted/50 text-muted-foreground">
          Please create or select an organization to create opening balances.
        </div>
      </div>
    );
  }

  const accounts = await getAccountsForTeam(team.id);
  const selectableAccounts = accounts.filter((acc) => !PROTECTED_NAMES.has(acc.name));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Opening Balance</h1>
          <p className="text-sm text-muted-foreground">
            Post a single as-of journal to establish beginning balances. A plug to Opening Balance
            Equity is added automatically.
          </p>
        </div>
        <Link href="/dashboard/journal" className="text-sm text-muted-foreground hover:underline">
          Back to Journals
        </Link>
      </div>

      {errorMessage && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {errorMessage}
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Upload CSV</h2>
          <p className="text-sm text-muted-foreground">
            Upload a CSV file to post opening balances. Account codes must match the existing chart
            of accounts.
          </p>
        </div>
        <OpeningBalanceCsvForm action={createOpeningBalanceFromCsv} />
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Manual Entry</h2>
          <p className="text-sm text-muted-foreground">
            Enter opening balance lines directly in the form below.
          </p>
        </div>
        <OpeningBalanceForm
          accounts={selectableAccounts.map((acc) => ({
            id: acc.id,
            code: acc.code,
            name: acc.name,
            type: acc.type,
          }))}
          action={createOpeningBalanceFromForm}
        />
      </div>
    </div>
  );
}
