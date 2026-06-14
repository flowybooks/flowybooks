'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { adjustJournalFromForm } from '../../actions';

type AccountOption = {
  id: string;
  code: string;
  name: string;
};

type InitialLine = {
  accountId: string;
  glDate: string;
  narration: string;
  debit: number;
  credit: number;
};

type JournalRow = {
  id: string;
  glDate: string;
  accountId: string;
  description: string;
  debit: string;
  credit: string;
};

type Props = {
  batchId: string;
  returnToJournalId: string;
  narration: string;
  cancelHref: string;
  accounts: AccountOption[];
  initialLines: InitialLine[];
};

function makeRow(seed?: Partial<JournalRow>): JournalRow {
  return {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    glDate: seed?.glDate ?? '',
    accountId: seed?.accountId ?? '',
    description: seed?.description ?? '',
    debit: seed?.debit ?? '',
    credit: seed?.credit ?? '',
  };
}

function parseMoneyToCents(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed * 100));
}

function formatCentsAsCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function formatDateKey(dateKey: string): string {
  if (!dateKey || dateKey === 'undated') return 'Undated';
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return parsed.toLocaleDateString('en-US');
}

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Saving...' : 'Save Changes'}
    </button>
  );
}

export function AdjustJournalForm({
  batchId,
  returnToJournalId,
  narration,
  cancelHref,
  accounts,
  initialLines,
}: Props) {
  const [rows, setRows] = useState<JournalRow[]>(() => {
    if (initialLines.length === 0) {
      return [makeRow(), makeRow()];
    }

    return initialLines.map((line) =>
      makeRow({
        glDate: line.glDate,
        accountId: line.accountId,
        description: line.narration,
        debit: line.debit > 0 ? (line.debit / 100).toFixed(2) : '',
        credit: line.credit > 0 ? (line.credit / 100).toFixed(2) : '',
      }),
    );
  });

  const totals = useMemo(() => {
    let totalDebits = 0;
    let totalCredits = 0;
    const byDate = new Map<string, { debits: number; credits: number }>();

    for (const row of rows) {
      const debit = parseMoneyToCents(row.debit);
      const credit = parseMoneyToCents(row.credit);
      const hasAnyValue =
        row.accountId.trim() ||
        row.description.trim() ||
        debit > 0 ||
        credit > 0 ||
        row.glDate.trim();

      if (!hasAnyValue) continue;

      totalDebits += debit;
      totalCredits += credit;

      const dateKey = row.glDate.trim() || 'undated';
      const current = byDate.get(dateKey) ?? { debits: 0, credits: 0 };
      current.debits += debit;
      current.credits += credit;
      byDate.set(dateKey, current);
    }

    const totalDifference = Math.abs(totalDebits - totalCredits);
    const unbalancedDates = Array.from(byDate.entries())
      .filter(([, dateTotals]) => dateTotals.debits !== dateTotals.credits)
      .sort(([left], [right]) => {
        if (left === 'undated') return 1;
        if (right === 'undated') return -1;
        return left.localeCompare(right);
      })
      .map(([dateKey, dateTotals]) => ({
        dateKey,
        debits: dateTotals.debits,
        credits: dateTotals.credits,
        difference: Math.abs(dateTotals.debits - dateTotals.credits),
      }));

    const effectiveDifference =
      unbalancedDates.length > 0
        ? unbalancedDates.reduce((sum, item) => sum + item.difference, 0)
        : totalDifference;

    return {
      totalDebits,
      totalCredits,
      totalDifference,
      difference: effectiveDifference,
      unbalancedDates,
    };
  }, [rows]);

  const isOutOfBalance = totals.unbalancedDates.length > 0 || totals.totalDifference !== 0;

  function updateRow(id: string, field: keyof JournalRow, value: string) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  function removeRow(id: string) {
    setRows((current) => (current.length === 1 ? current : current.filter((row) => row.id !== id)));
  }

  function addRow() {
    setRows((current) => [...current, makeRow()]);
  }

  return (
    <form action={adjustJournalFromForm} className="space-y-6 border rounded-md p-4 bg-card">
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="returnToJournalId" value={returnToJournalId} />
      <input type="hidden" name="rowCount" value={rows.length} />

      <div className="space-y-1">
        <label htmlFor="narration" className="text-sm font-medium">
          Narration (batch description)
        </label>
        <input
          id="narration"
          name="narration"
          type="text"
          defaultValue={narration}
          required
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      {isOutOfBalance ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {totals.unbalancedDates.length > 0 ? (
            <div className="space-y-1">
              <p>
                Out of balance on {totals.unbalancedDates.length} date
                {totals.unbalancedDates.length === 1 ? '' : 's'}:
              </p>
              {totals.unbalancedDates.map((item) => (
                <p key={item.dateKey}>
                  {formatDateKey(item.dateKey)}: Debits {formatCentsAsCurrency(item.debits)},
                  Credits {formatCentsAsCurrency(item.credits)} (difference:{' '}
                  {formatCentsAsCurrency(item.difference)})
                </p>
              ))}
            </div>
          ) : (
            <p>
              Out of balance by {formatCentsAsCurrency(totals.totalDifference)}: Debits{' '}
              {formatCentsAsCurrency(totals.totalDebits)}, Credits{' '}
              {formatCentsAsCurrency(totals.totalCredits)}
            </p>
          )}
        </div>
      ) : null}

      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left">Line</th>
              <th className="px-3 py-2 text-left">GL Date</th>
              <th className="px-3 py-2 text-left">Account</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-right">Debit</th>
              <th className="px-3 py-2 text-right">Credit</th>
              <th className="px-3 py-2 text-right">Delete</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id} className="border-t">
                <td className="px-3 py-2 text-xs text-muted-foreground">{index + 1}</td>
                <td className="px-3 py-2">
                  <input
                    name={`lineGlDate_${index}`}
                    type="date"
                    value={row.glDate}
                    onChange={(event) => updateRow(row.id, 'glDate', event.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    name={`accountId_${index}`}
                    value={row.accountId}
                    onChange={(event) => updateRow(row.id, 'accountId', event.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                  >
                    <option value="">-- Select account --</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.code} - {account.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    name={`lineDescription_${index}`}
                    type="text"
                    value={row.description}
                    onChange={(event) => updateRow(row.id, 'description', event.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                    placeholder="Line description"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    name={`debit_${index}`}
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.debit}
                    onChange={(event) => updateRow(row.id, 'debit', event.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-right"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    name={`credit_${index}`}
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.credit}
                    onChange={(event) => updateRow(row.id, 'credit', event.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-right"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    className="rounded border border-input px-2 py-1 text-xs hover:bg-muted"
                    aria-label={`Delete line ${index + 1}`}
                    title="Delete line"
                  >
                    ❌
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/30">
            <tr>
              <td colSpan={4} className="px-3 py-2 text-right font-medium">
                Total Debits | Total Credits | Difference
              </td>
              <td className="px-3 py-2 text-right font-semibold">
                {formatCentsAsCurrency(totals.totalDebits)}
              </td>
              <td className="px-3 py-2 text-right font-semibold">
                {formatCentsAsCurrency(totals.totalCredits)}
              </td>
              <td className="px-3 py-2 text-right font-semibold">
                {formatCentsAsCurrency(totals.difference)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center rounded-md border border-input px-3 py-2 text-sm hover:bg-muted"
        >
          + Add line
        </button>
        <div className="flex gap-2">
          <Link
            href={cancelHref}
            className="inline-flex items-center rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Cancel
          </Link>
          <SaveButton disabled={isOutOfBalance} />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Debits and credits must balance. Saving updates this journal entry while preserving backend
        audit history.
      </p>
    </form>
  );
}
