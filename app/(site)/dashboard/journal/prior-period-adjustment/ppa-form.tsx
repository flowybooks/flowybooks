'use client';

import { useState } from 'react';

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

export function PriorPeriodAdjustmentForm({ accounts, action }: Props) {
  const [rows, setRows] = useState(20);

  const addRows = (count = 5) => {
    setRows((prev) => Math.min(prev + count, 200));
  };

  const formattedAccounts = accounts.sort((a, b) => a.code.localeCompare(b.code));

  return (
    <form action={action} className="space-y-6 border rounded-md p-4 bg-card">
      <input type="hidden" name="rowCount" value={rows} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">As-of date</label>
          <input
            name="asOfDate"
            type="date"
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted-foreground">Date of the closed period being adjusted.</p>
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium">Description</label>
          <input
            name="description"
            type="text"
            placeholder="Prior period adjustment"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <label className="text-sm font-medium mt-2 block">Reason (optional)</label>
          <input
            name="reason"
            type="text"
            placeholder="e.g. Prior period audit adjustment"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Balance-sheet accounts only. A plug to Prior Period Adjustments will be added
          automatically.
        </div>
        <button
          type="button"
          onClick={() => addRows(5)}
          className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
        >
          + Add 5 rows (max 200)
        </button>
      </div>

      <div className="border rounded-md overflow-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left">Line</th>
              <th className="px-3 py-2 text-left">Account</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-right">Debit</th>
              <th className="px-3 py-2 text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, index) => (
              <tr key={index} className="border-t">
                <td className="px-3 py-2 text-xs text-muted-foreground">{index + 1}</td>
                <td className="px-3 py-2">
                  <select
                    name={`accountId_${index}`}
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
                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-right"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    name={`credit_${index}`}
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-right"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          className="inline-flex items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90"
        >
          Post Prior Period Adjustment
        </button>
      </div>
    </form>
  );
}
