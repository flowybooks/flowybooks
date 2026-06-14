'use client';

import { useState } from 'react';

import { BulkSelectCheckbox } from './bulk-select-checkbox';
import { MonthSection } from './month-section';
import { TransactionRows } from './transaction-rows';
import type { Account, Transaction } from './transaction-table-types';
import { getMonthKey, getTransactionStatus } from './transaction-table-utils';

interface Props {
  transactions: Transaction[];
  accounts: Account[];
  groupByMonth?: boolean;
  defaultView?: 'all' | 'uncategorized';
}

type Filters = {
  posted: boolean;
  categorized: boolean;
  uncategorized: boolean;
};

export function TransactionTable({
  transactions,
  accounts,
  groupByMonth,
  defaultView = 'uncategorized',
}: Props) {
  const [filters, setFilters] = useState<Filters>({
    posted: false,
    categorized: false,
    uncategorized: defaultView === 'uncategorized',
  });

  const hasActiveFilters = Object.values(filters).some(Boolean);
  const filteredTransactions = transactions.filter((tx) => {
    if (!hasActiveFilters) return true;
    const status = getTransactionStatus(tx);
    if (status === 'posted') return filters.posted;
    if (status === 'categorized') return filters.categorized;
    if (status === 'uncategorized') return filters.uncategorized;
    return false;
  });

  const monthGroups = groupByMonth ? groupTransactionsByMonth(filteredTransactions) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 border rounded-md bg-muted/30 px-3 py-2 text-xs">
        <BulkSelectCheckbox transactions={transactions} />
        <span className="w-px h-4 bg-border" />
        <span className="font-medium text-muted-foreground">Show</span>
        <button
          type="button"
          onClick={() => setFilters({ posted: false, categorized: false, uncategorized: false })}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
            !hasActiveFilters
              ? 'bg-black text-white border-black'
              : 'bg-background text-muted-foreground hover:bg-muted'
          }`}
        >
          All
        </button>
        {(['posted', 'categorized', 'uncategorized'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilters((current) => ({ ...current, [key]: !current[key] }))}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              filters[key]
                ? 'bg-black text-white border-black'
                : 'bg-background text-muted-foreground hover:bg-muted'
            }`}
          >
            {key.charAt(0).toUpperCase() + key.slice(1)}
          </button>
        ))}
      </div>

      {monthGroups ? (
        monthGroups.length === 0 ? (
          <div className="border rounded-md p-6 text-center text-muted-foreground text-sm">
            No transactions match the selected filters.
          </div>
        ) : (
          monthGroups.map(([monthKey, txns]) => (
            <MonthSection
              key={monthKey}
              monthKey={monthKey}
              transactions={txns}
              accounts={accounts}
            />
          ))
        )
      ) : (
        <div className="border rounded-md overflow-hidden">
          <TransactionRows transactions={filteredTransactions} accounts={accounts} />
        </div>
      )}
    </div>
  );
}

function groupTransactionsByMonth(transactions: Transaction[]): Array<[string, Transaction[]]> {
  const groups = new Map<string, Transaction[]>();

  for (const tx of transactions) {
    const key = getMonthKey(tx.transactionDate);
    const group = groups.get(key) ?? [];
    group.push(tx);
    groups.set(key, group);
  }

  return Array.from(groups.entries()).sort(([a], [b]) => b.localeCompare(a));
}
