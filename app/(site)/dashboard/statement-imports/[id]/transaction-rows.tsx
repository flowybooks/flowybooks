'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { toggleTransactionExcluded } from '../actions';
import { TransactionCategoryCell } from './transaction-category-cell';
import { TransactionDescriptionCell } from './transaction-description-cell';
import type { Account, Transaction } from './transaction-table-types';
import {
  formatCentsAsCurrency,
  getStatusClassName,
  getStatusLabel,
  getTransactionStatus,
} from './transaction-table-utils';

export function TransactionRows({
  transactions,
  accounts,
}: {
  transactions: Transaction[];
  accounts: Account[];
}) {
  async function handleExcludeToggle(transactionId: string, currentValue: boolean) {
    await toggleTransactionExcluded(transactionId, !currentValue);
  }

  return (
    <Table className="text-[0.75rem]">
      <TableHeader>
        <TableRow className="bg-muted/50 hover:bg-muted/50">
          <TableHead className="w-[40px]"></TableHead>
          <TableHead className="w-[90px]">Date</TableHead>
          <TableHead className="w-[320px]">Description</TableHead>
          <TableHead className="w-[110px]">Status</TableHead>
          <TableHead className="text-right w-[110px]">Amount</TableHead>
          <TableHead className="w-[320px]">Category</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
              No transactions match the selected filters.
            </TableCell>
          </TableRow>
        ) : (
          transactions.map((tx) => {
            const status = getTransactionStatus(tx);
            const isLocked = status === 'posted';
            return (
              <TableRow key={tx.id} className={tx.isExcluded ? 'opacity-50' : ''}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={!tx.isExcluded}
                    onChange={() => handleExcludeToggle(tx.id, tx.isExcluded)}
                    title={tx.isExcluded ? 'Include transaction' : 'Exclude transaction'}
                    className="rounded border-gray-300"
                    disabled={isLocked}
                  />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {tx.transactionDate.toLocaleDateString()}
                </TableCell>
                <TableCell className="max-w-[320px]">
                  <TransactionDescriptionCell tx={tx} isLocked={isLocked} />
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-medium ring-1 ring-inset ${getStatusClassName(status)}`}
                  >
                    {getStatusLabel(status)}
                  </span>
                </TableCell>
                <TableCell
                  className={`text-right font-medium ${
                    tx.amountCents < 0 ? 'text-red-600' : 'text-green-600'
                  }`}
                >
                  {formatCentsAsCurrency(tx.amountCents)}
                </TableCell>
                <TableCell>
                  <TransactionCategoryCell tx={tx} accounts={accounts} isLocked={isLocked} />
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
