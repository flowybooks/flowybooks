'use client';

import { useEffect, useState } from 'react';

import { updateTransactionDescription } from '../actions';
import type { Transaction } from './transaction-table-types';

export function TransactionDescriptionCell({
  tx,
  isLocked,
}: {
  tx: Transaction;
  isLocked: boolean;
}) {
  const [value, setValue] = useState(tx.description);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setValue(tx.description);
  }, [tx.description]);

  async function handleSave() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === tx.description) {
      setValue(tx.description);
      return;
    }

    setIsSaving(true);
    try {
      await updateTransactionDescription(tx.id, trimmed);
    } catch (error) {
      console.error(error);
      setValue(tx.description);
    } finally {
      setIsSaving(false);
    }
  }

  const showRaw = value.trim() !== tx.rawDescription;

  return (
    <div className="max-w-[320px] space-y-0.5">
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={handleSave}
        disabled={tx.isExcluded || isSaving || isLocked}
        className={`w-full rounded border px-2 py-1 bg-background ${
          tx.isExcluded ? 'line-through opacity-50' : ''
        }`}
      />
      {showRaw ? (
        <div className="text-[0.6875rem] text-muted-foreground truncate max-w-[320px]">
          {tx.rawDescription}
        </div>
      ) : null}
      {isSaving ? <div className="text-[0.6875rem] text-muted-foreground">Saving...</div> : null}
    </div>
  );
}
