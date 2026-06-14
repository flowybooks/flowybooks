import Link from 'next/link';
import { getTeamForUser, getAccountsForTeam } from '@/lib/db/queries';
import { JournalForm } from './journal-form';

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewJournalPage({ searchParams }: PageProps) {
  const team = await getTeamForUser();
  const params = searchParams ? await searchParams : undefined;
  const errorParam = params?.error;
  const errorMessage =
    typeof errorParam === 'string'
      ? errorParam
      : Array.isArray(errorParam)
        ? errorParam[0]
        : undefined;

  if (!team) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold tracking-tight mb-4">New Journal</h1>
        <div className="p-4 border rounded-md bg-muted/50 text-muted-foreground">
          Please create or select an organization to create journals.
        </div>
      </div>
    );
  }

  const accounts = await getAccountsForTeam(team.id);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Journal</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Create a draft journal entry. Add or remove lines as needed.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Or{' '}
          <Link href="/dashboard/journal/import" className="underline hover:text-foreground">
            import journals from CSV
          </Link>
          .
        </p>
      </div>

      {errorMessage && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {errorMessage}
        </div>
      )}

      <JournalForm accounts={accounts} />
    </div>
  );
}
