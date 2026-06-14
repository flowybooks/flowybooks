'use client';

import { BulkSelectCheckbox } from './bulk-select-checkbox';
import { TransactionRows } from './transaction-rows';
import type { Account, Transaction } from './transaction-table-types';
import { formatCentsAsCurrency, formatMonthLabel } from './transaction-table-utils';

export function MonthSection({
  monthKey,
  transactions,
  accounts,
}: {
  monthKey: string;
  transactions: Transaction[];
  accounts: Account[];
}) {
  const totalIn = transactions
    .filter((tx) => tx.amountCents > 0 && !tx.isExcluded)
    .reduce((sum, tx) => sum + tx.amountCents, 0);
  const totalOut = transactions
    .filter((tx) => tx.amountCents < 0 && !tx.isExcluded)
    .reduce((sum, tx) => sum + Math.abs(tx.amountCents), 0);
  const activeCount = transactions.filter((tx) => !tx.isExcluded).length;

  return (
    <details open className="border rounded-md overflow-hidden">
      <summary className="cursor-pointer list-none px-4 py-2 bg-muted/30 text-sm font-medium hover:bg-muted/50 flex items-center gap-3">
        <span onClick={(event) => event.stopPropagation()}>
          <BulkSelectCheckbox transactions={transactions} />
        </span>
        <span>
          {formatMonthLabel(monthKey)} &middot; {activeCount} txns
          {totalIn > 0 ? (
            <span className="text-green-600 ml-2">{formatCentsAsCurrency(totalIn)} in</span>
          ) : null}
          {totalOut > 0 ? (
            <span className="text-red-600 ml-2">{formatCentsAsCurrency(totalOut)} out</span>
          ) : null}
        </span>
      </summary>
      <TransactionRows transactions={transactions} accounts={accounts} />
    </details>
  );
}
