'use client';

import { useEffect, useRef, useState } from 'react';

import { bulkSetTransactionsExcluded } from '../actions';
import type { Transaction } from './transaction-table-types';

export function BulkSelectCheckbox({ transactions }: { transactions: Transaction[] }) {
  const [isSaving, setIsSaving] = useState(false);
  const checkboxRef = useRef<HTMLInputElement>(null);

  const toggleable = transactions.filter((tx) => !tx.journalBatchId);
  const includedCount = toggleable.filter((tx) => !tx.isExcluded).length;
  const allIncluded = toggleable.length > 0 && includedCount === toggleable.length;
  const noneIncluded = includedCount === 0;
  const isIndeterminate = !allIncluded && !noneIncluded;

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = isIndeterminate;
    }
  }, [isIndeterminate]);

  if (toggleable.length === 0) return null;

  async function handleChange() {
    setIsSaving(true);
    try {
      const ids = toggleable.map((tx) => tx.id);
      await bulkSetTransactionsExcluded(ids, allIncluded);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <input
      ref={checkboxRef}
      type="checkbox"
      checked={allIncluded}
      onChange={handleChange}
      disabled={isSaving}
      className="rounded border-gray-300 disabled:opacity-50"
      title={allIncluded ? 'Deselect all' : 'Select all'}
    />
  );
}
