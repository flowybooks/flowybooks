import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJournalDetailForCurrentTeam } from '../../actions';
import { getAccountsForTeam, getTeamForUser } from '@/lib/db/queries';
import { notFound as notFoundFn } from 'next/navigation';
import { AdjustJournalForm } from './adjust-journal-form';

function isUuid(value: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
    value,
  );
}

type PageParams = {
  id: string;
};

type PageProps = {
  params: Promise<PageParams>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EditJournalPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  if (!isUuid(id)) {
    notFoundFn();
  }
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
    notFound();
  }

  const detail = await getJournalDetailForCurrentTeam(id);
  if (!detail) {
    notFound();
  }

  const accounts = await getAccountsForTeam(team!.id);
  const { batch, lines, routeId } = detail;
  const initialLines = lines.map((line) => ({
    accountId: line.accountId,
    glDate: new Date(line.glDate).toISOString().slice(0, 10),
    narration: line.narration ?? '',
    debit: line.debit ?? 0,
    credit: line.credit ?? 0,
  }));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {batch.status === 'posted' ? 'Edit Journal' : 'Edit Draft Journal'}
          </h1>
          <p className="text-sm text-muted-foreground">Editing batch: {batch.description}</p>
        </div>
        <Link
          href={`/dashboard/journal/${routeId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          Cancel
        </Link>
      </div>

      {errorMessage && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {errorMessage}
        </div>
      )}

      <AdjustJournalForm
        batchId={batch.id}
        returnToJournalId={routeId}
        narration={batch.description}
        cancelHref={`/dashboard/journal/${routeId}`}
        accounts={accounts.map((account) => ({
          id: account.id,
          code: account.code,
          name: account.name,
        }))}
        initialLines={initialLines}
      />
    </div>
  );
}
