'use client';

import { useEffect, useState } from 'react';

import { categorizeTransaction, updateTransactionAllocations } from '../actions';
import type { Account, Transaction } from './transaction-table-types';
import {
  type AllocationDraft,
  randomId,
  validateAllocationDrafts,
} from './transaction-table-utils';

function buildDrafts(tx: Transaction, absAmountCents: number): AllocationDraft[] {
  if (tx.allocations && tx.allocations.length > 0) {
    return tx.allocations.map((allocation) => ({
      id: randomId(),
      accountId: allocation.accountId,
      amount: (allocation.amountCents / 100).toFixed(2),
    }));
  }

  return [
    {
      id: randomId(),
      accountId: tx.confirmedAccountId ?? '',
      amount: (absAmountCents / 100).toFixed(2),
    },
  ];
}

export function TransactionCategoryCell({
  tx,
  accounts,
  isLocked,
}: {
  tx: Transaction;
  accounts: Account[];
  isLocked: boolean;
}) {
  const absAmountCents = Math.abs(tx.amountCents);
  const hasPersistedSplits = Boolean(tx.allocations && tx.allocations.length > 1);

  const [isSplitMode, setIsSplitMode] = useState(hasPersistedSplits);
  const [drafts, setDrafts] = useState<AllocationDraft[]>(() => buildDrafts(tx, absAmountCents));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setError(null);
    setDrafts(buildDrafts(tx, absAmountCents));
    setIsSplitMode(Boolean(tx.allocations && tx.allocations.length > 1));
  }, [tx, absAmountCents]);

  async function handleSingleAccountChange(accountId: string) {
    await categorizeTransaction(tx.id, accountId || null);
  }

  function enableSplitMode() {
    setIsSplitMode(true);
    setError(null);
    setDrafts((current) => {
      if (current.length > 1) return current;
      return [
        current[0] ?? {
          id: randomId(),
          accountId: tx.confirmedAccountId ?? '',
          amount: (absAmountCents / 100).toFixed(2),
        },
        { id: randomId(), accountId: '', amount: '' },
      ];
    });
  }

  function addLine() {
    setDrafts((current) => [...current, { id: randomId(), accountId: '', amount: '' }]);
  }

  function removeLine(id: string) {
    setDrafts((current) => current.filter((draft) => draft.id !== id));
  }

  async function saveAllocations() {
    setError(null);

    const validation = validateAllocationDrafts(drafts, absAmountCents);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    setIsSaving(true);
    try {
      await updateTransactionAllocations({
        transactionId: tx.id,
        allocations: validation.allocations,
      });
    } catch (error) {
      console.error(error);
      setError(
        error instanceof Error ? error.message : 'Failed to save allocations. Please try again.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!isSplitMode) {
    return (
      <div className="flex items-center gap-2">
        <select
          value={tx.confirmedAccountId || ''}
          onChange={(event) => handleSingleAccountChange(event.target.value)}
          disabled={tx.isExcluded || isLocked}
          className="w-full text-[0.75rem] border rounded px-2 py-1 bg-background disabled:opacity-50"
        >
          <option value="">Select account...</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.code} - {account.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={enableSplitMode}
          disabled={tx.isExcluded || isLocked}
          className="shrink-0 text-[0.6875rem] border rounded px-2 py-1 hover:bg-muted disabled:opacity-50"
        >
          Split
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        {drafts.map((draft, idx) => (
          <div key={draft.id} className="flex items-center gap-2">
            <select
              value={draft.accountId}
              onChange={(event) => {
                const next = event.target.value;
                setDrafts((current) =>
                  current.map((row) => (row.id === draft.id ? { ...row, accountId: next } : row)),
                );
              }}
              disabled={tx.isExcluded || isSaving}
              className="flex-1 text-[0.75rem] border rounded px-2 py-1 bg-background disabled:opacity-50"
            >
              <option value="">Select account...</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} - {account.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              inputMode="decimal"
              value={draft.amount}
              onChange={(event) => {
                const next = event.target.value;
                setDrafts((current) =>
                  current.map((row) => (row.id === draft.id ? { ...row, amount: next } : row)),
                );
              }}
              disabled={tx.isExcluded || isSaving}
              placeholder="0.00"
              className="w-[110px] text-right text-[0.75rem] border rounded px-2 py-1 bg-background disabled:opacity-50"
              aria-label={`Amount for line ${idx + 1}`}
            />
            {drafts.length > 1 ? (
              <button
                type="button"
                onClick={() => removeLine(draft.id)}
                disabled={tx.isExcluded || isSaving || drafts.length === 1 || isLocked}
                className="shrink-0 text-[0.6875rem] border rounded px-2 py-1 hover:bg-muted disabled:opacity-50"
                aria-label="Remove line"
              >
                Remove
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={addLine}
          disabled={tx.isExcluded || isSaving || isLocked}
          className="text-[0.6875rem] border rounded px-2 py-1 hover:bg-muted disabled:opacity-50"
        >
          + Add line
        </button>
        <button
          type="button"
          onClick={saveAllocations}
          disabled={tx.isExcluded || isSaving || isLocked}
          className="text-[0.6875rem] rounded bg-black px-2 py-1 text-white hover:bg-black/90 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {error ? <div className="text-[0.6875rem] text-red-600">{error}</div> : null}
    </div>
  );
}
