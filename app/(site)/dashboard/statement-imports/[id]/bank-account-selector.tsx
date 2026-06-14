'use client';

import { setLinkedAccount } from '../actions';

interface Account {
  id: string;
  code: string;
  name: string;
}

interface Props {
  importId: string;
  currentAccountId: string | null;
  accounts: Account[];
  disabled?: boolean;
}

export function BankAccountSelector({ importId, currentAccountId, accounts, disabled }: Props) {
  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value || null;
    await setLinkedAccount(importId, value);
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-muted-foreground">Statement Account:</label>
      <select
        value={currentAccountId || ''}
        onChange={handleChange}
        disabled={disabled}
        className="text-sm border rounded px-2 py-1 bg-background disabled:opacity-50"
      >
        <option value="">Select statement account...</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.code} - {account.name}
          </option>
        ))}
      </select>
    </div>
  );
}
