// This page shows one journal entry in detail.
// It loads the batch, displays its lines and totals, and exposes
// entry-level actions like edit, post, delete, or void.

import { getJournalDetailForCurrentTeam } from '../actions';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { notFound } from 'next/navigation';
import { JournalBatchActionForm } from '../journal-batch-action-form';
import { formatStoredAccountingDate } from '@/lib/utils/accounting-date';

function isUuid(value: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
    value,
  );
}

function formatJournalTitle(description: string): string {
  const trimmed = description.trim();
  const statementPrefix = 'Statement import:';

  if (!trimmed.startsWith(statementPrefix)) {
    return trimmed;
  }

  const namesPart = trimmed.slice(statementPrefix.length).trim();
  if (!namesPart) {
    return 'Statement import';
  }

  const fileNames = namesPart
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  if (fileNames.length > 1) {
    return `Statement import (${fileNames.length} files)`;
  }

  const fileName = fileNames[0] ?? 'file';
  if (fileName.length > 90) {
    return `Statement import: ${fileName.slice(0, 87)}...`;
  }

  return `Statement import: ${fileName}`;
}

type JournalPageParams = {
  id: string;
};

type JournalPageProps = {
  params: Promise<JournalPageParams>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function JournalDetailPage({ params, searchParams }: JournalPageProps) {
  const { id } = await params;

  if (!isUuid(id)) {
    notFound();
  }

  const focusLineParam = searchParams ? (await searchParams).focusLine : undefined;
  const focusLine =
    typeof focusLineParam === 'string'
      ? focusLineParam
      : Array.isArray(focusLineParam)
        ? focusLineParam[0]
        : undefined;
  const detail = await getJournalDetailForCurrentTeam(id);

  if (!detail) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold tracking-tight mb-4">Journal</h1>
        <div className="p-4 border rounded-md bg-muted/50 text-muted-foreground">
          Journal not found.
        </div>
      </div>
    );
  }

  const { batch, lines, totals, routeId } = detail;
  const statusLabel =
    batch.status === 'posted' ? 'Posted' : batch.status === 'voided' ? 'Voided' : 'Draft';
  const statusClass =
    batch.status === 'posted'
      ? 'text-green-600'
      : batch.status === 'voided'
        ? 'text-red-600'
        : 'text-muted-foreground';

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {formatJournalTitle(batch.description)}
        </h1>
        <p className="text-sm text-muted-foreground">
          {formatStoredAccountingDate(batch.date)} ·{' '}
          <span className={`font-medium ${statusClass}`}>{statusLabel}</span>
        </p>
        <p className="mt-2 text-sm font-medium">Journal Entry</p>

        <div className="mt-4 flex gap-2">
          <a
            href={`/dashboard/journal/${routeId}/edit`}
            className="inline-flex items-center rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground link-on-hover"
          >
            Edit
          </a>
        </div>

        {batch.status === 'draft' && (
          <div className="mt-4 flex gap-2">
            <JournalBatchActionForm
              kind="post-draft"
              batchId={batch.id}
              label="Post Journal"
              pendingLabel="Posting..."
              buttonClassName="inline-flex items-center rounded-md bg-black px-3 py-1 text-xs font-medium text-white hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-50"
            />

            <JournalBatchActionForm
              kind="delete-draft"
              batchId={batch.id}
              label="Delete Journal"
              pendingLabel="Deleting..."
              buttonClassName="inline-flex items-center rounded-md border border-destructive px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        )}

        {batch.status === 'posted' && (
          <div className="mt-4">
            <JournalBatchActionForm
              kind="void-posted"
              batchId={batch.id}
              label="Delete Journal"
              pendingLabel="Deleting..."
              buttonClassName="inline-flex items-center rounded-md border border-destructive px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        )}
      </div>

      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-[140px]">GL Date</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[120px] text-right">Debit</TableHead>
              <TableHead className="w-[120px] text-right">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow
                key={line.id}
                className={focusLine === line.id ? 'bg-primary/10' : undefined}
              >
                <TableCell>{formatStoredAccountingDate(line.glDate)}</TableCell>
                <TableCell>
                  <div className="font-medium">{line.accountName || 'Account'}</div>
                  <div className="text-xs text-muted-foreground">{line.accountCode}</div>
                </TableCell>
                <TableCell className="text-muted-foreground">{line.narration || '-'}</TableCell>
                <TableCell className="text-right">
                  {line.debit
                    ? (line.debit / 100).toLocaleString('en-US', {
                        style: 'currency',
                        currency: 'USD',
                      })
                    : ''}
                </TableCell>
                <TableCell className="text-right">
                  {line.credit
                    ? (line.credit / 100).toLocaleString('en-US', {
                        style: 'currency',
                        currency: 'USD',
                      })
                    : ''}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/30">
              <TableCell colSpan={3} className="text-right font-semibold">
                Totals
              </TableCell>
              <TableCell className="text-right font-semibold">
                {(totals.totalDebit / 100).toLocaleString('en-US', {
                  style: 'currency',
                  currency: 'USD',
                })}
              </TableCell>
              <TableCell className="text-right font-semibold">
                {(totals.totalCredit / 100).toLocaleString('en-US', {
                  style: 'currency',
                  currency: 'USD',
                })}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
