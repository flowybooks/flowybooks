'use client';

import { useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';

type AccountOption = {
  id: string;
  code: string;
  name: string;
  type: string;
};

type Props = {
  accounts: AccountOption[];
  action: (formData: FormData) => void;
};

type OpeningBalanceRow = {
  id: string;
  accountId: string;
  description: string;
  debit: string;
  credit: string;
};

function makeRow(seed?: Partial<OpeningBalanceRow>): OpeningBalanceRow {
  return {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Posting...' : 'Post Opening Balance'}
    </button>
  );
}

export function OpeningBalanceForm({ accounts, action }: Props) {
  const [rows, setRows] = useState<OpeningBalanceRow[]>(
    Array.from({ length: 20 }, () => makeRow()),
  );

  const addRows = (count = 5) => {
    setRows((prev) => {
      const nextCount = Math.min(prev.length + count, 200);
      const toAdd = nextCount - prev.length;
      if (toAdd <= 0) {
        return prev;
      }
      return [...prev, ...Array.from({ length: toAdd }, () => makeRow())];
    });
  };

  const removeRow = (rowId: string) => {
    setRows((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((row) => row.id !== rowId);
    });
  };

  const updateRow = (rowId: string, field: keyof Omit<OpeningBalanceRow, 'id'>, value: string) => {
    setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)));
  };

  const formattedAccounts = [...accounts].sort((a, b) => a.code.localeCompare(b.code));
  const totals = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;
    for (const row of rows) {
      totalDebit += parseMoneyToCents(row.debit);
      totalCredit += parseMoneyToCents(row.credit);
    }
    return {
      totalDebit,
      totalCredit,
      difference: totalDebit - totalCredit,
    };
  }, [rows]);

  return (
    <form action={action} className="space-y-6 border rounded-md p-4 bg-card">
      <input type="hidden" name="rowCount" value={rows.length} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">As-of date</label>
          <input
            name="asOfDate"
            type="date"
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Balances reflect the books through this date.
          </p>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Books start date</label>
          <input
            name="booksStartDate"
            type="date"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Optional. If set, typically the day after the as-of date.
          </p>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Description</label>
          <input
            name="description"
            type="text"
            placeholder="Opening balance entry"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          If you include income/expense lines, add a Retained Earnings line that is prior-years only
          to avoid double-counting Current Year Earnings.
        </div>
        <button
          type="button"
          onClick={() => addRows(5)}
          className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
        >
          + Add 5 rows (max 200)
        </button>
      </div>

      {totals.difference !== 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Difference of {formatCentsAsCurrency(Math.abs(totals.difference))} will be auto-posted to
          Opening Balance Equity.
        </div>
      )}

      <div className="border rounded-md overflow-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left">Line</th>
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
                  <select
                    name={`accountId_${index}`}
                    value={row.accountId}
                    onChange={(event) => updateRow(row.id, 'accountId', event.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                  >
                    <option value="">-- Select account --</option>
                    {formattedAccounts.map((account) => (
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
              <td colSpan={3} className="px-3 py-2 text-right font-medium">
                Total Debits | Total Credits | Difference
              </td>
              <td className="px-3 py-2 text-right font-semibold">
                {formatCentsAsCurrency(totals.totalDebit)}
              </td>
              <td className="px-3 py-2 text-right font-semibold">
                {formatCentsAsCurrency(totals.totalCredit)}
              </td>
              <td className="px-3 py-2 text-right font-semibold">
                {formatCentsAsCurrency(Math.abs(totals.difference))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
