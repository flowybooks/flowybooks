// This page shows the journal list for the current team.
// It loads journal batches, shows their status, and lets the user open
// details or run simple actions like deleting or voiding an entry.

import { listJournalsForCurrentTeam } from './actions';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { Button } from '@/components/ui/button';
import { Download, Plus } from 'lucide-react';
import Link from 'next/link';
import { JournalBatchActionForm } from './journal-batch-action-form';
import { formatStoredAccountingDate } from '@/lib/utils/accounting-date';

export default async function JournalPage() {
  const batches = await listJournalsForCurrentTeam();

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
      <h1 className="text-2xl font-bold tracking-tight">Journals</h1>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <a href="/templates/journal-entry-template.csv" download>
            <Download className="mr-2 h-4 w-4" />
            Download Template
          </a>
        </Button>
        <Link href="/dashboard/journal/import">
          <Button size="sm" variant="outline">
            Import Entries
          </Button>
        </Link>
        <Link href="/dashboard/journal/opening-balance">
          <Button size="sm" variant="outline">
            Opening Balance
          </Button>
        </Link>
        <Link href="/dashboard/journal/prior-period-adjustment">
          <Button size="sm" variant="outline">
            Prior Period Adj.
          </Button>
        </Link>
        <Link href="/dashboard/journal/new">
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New Entry
          </Button>
        </Link>
      </div>
    </div>
  );

  if (batches.length === 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        {header}
        <div className="p-4 border rounded-md bg-muted/50 text-muted-foreground">
          No journals found for this organization.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {header}

      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-[140px]">Date</TableHead>
              <TableHead className="w-[160px]">Last Modified</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[140px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batches.map((batch) => (
              <TableRow key={batch.id}>
                <TableCell>{formatStoredAccountingDate(batch.date)}</TableCell>
                <TableCell>
                  {batch.updatedAt ? new Date(batch.updatedAt).toLocaleDateString('en-US') : '-'}
                </TableCell>
                <TableCell>
                  <a
                    href={`/dashboard/journal/${batch.routeId}`}
                    className="font-medium text-foreground link-on-hover"
                  >
                    {batch.description}
                  </a>
                </TableCell>
                <TableCell className="capitalize text-muted-foreground">{batch.status}</TableCell>
                <TableCell className="text-right">
                  {batch.status === 'draft' ? (
                    <JournalBatchActionForm
                      kind="delete-draft"
                      batchId={batch.id}
                      label="Delete"
                      pendingLabel="Deleting..."
                      formClassName="inline-flex"
                      buttonClassName="inline-flex items-center rounded-md border border-destructive px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  ) : null}
                  {batch.status === 'posted' ? (
                    <JournalBatchActionForm
                      kind="void-posted"
                      batchId={batch.id}
                      label="Delete"
                      pendingLabel="Deleting..."
                      formClassName="inline-flex"
                      buttonClassName="inline-flex items-center rounded-md border border-destructive px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
