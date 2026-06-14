'use client';

import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import type { KevinJournalProposal } from '@/lib/kevin/types';

function money(cents: number) {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

export function ProposalPreview({
  proposal,
  onCreate,
  busy,
}: {
  proposal: KevinJournalProposal;
  onCreate: (status: 'draft' | 'posted') => void;
  busy: boolean;
}) {
  const totals = useMemo(
    () =>
      proposal.lines.reduce(
        (sum, line) => ({
          debit: sum.debit + line.debitCents,
          credit: sum.credit + line.creditCents,
        }),
        { debit: 0, credit: 0 },
      ),
    [proposal],
  );

  return (
    <div className="mt-4 overflow-hidden border border-border/70 bg-background">
      <div className="flex flex-col gap-2 border-b border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-medium">{proposal.description}</h3>
          <p className="text-xs text-muted-foreground">
            {proposal.date} · confidence {proposal.confidence}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onCreate('draft')}>
            Draft
          </Button>
          <Button size="sm" disabled={busy} onClick={() => onCreate('posted')}>
            Confirm post
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Account</th>
              <th className="px-4 py-2 text-left font-medium">Memo</th>
              <th className="px-4 py-2 text-right font-medium">Debit</th>
              <th className="px-4 py-2 text-right font-medium">Credit</th>
            </tr>
          </thead>
          <tbody>
            {proposal.lines.map((line, index) => (
              <tr key={`${line.accountCode}-${index}`} className="border-t border-border/60">
                <td className="px-4 py-2">
                  {line.accountCode}
                  {line.accountName ? ` · ${line.accountName}` : ''}
                </td>
                <td className="px-4 py-2 text-muted-foreground">{line.memo ?? ''}</td>
                <td className="px-4 py-2 text-right">
                  {line.debitCents ? money(line.debitCents) : ''}
                </td>
                <td className="px-4 py-2 text-right">
                  {line.creditCents ? money(line.creditCents) : ''}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-border/70 bg-muted/30 text-sm font-medium">
            <tr>
              <td className="px-4 py-2" colSpan={2}>
                Totals
              </td>
              <td className="px-4 py-2 text-right">{money(totals.debit)}</td>
              <td className="px-4 py-2 text-right">{money(totals.credit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
