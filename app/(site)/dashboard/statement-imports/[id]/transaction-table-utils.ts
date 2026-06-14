import type { Transaction, TransactionStatus } from './transaction-table-types';

export function formatCentsAsCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

export function parseCurrencyToCents(value: string): number | null {
  const cleaned = value.trim().replace(/[$,]/g, '');
  if (cleaned === '') return null;
  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric * 100);
}

export function getTransactionStatus(tx: Transaction): TransactionStatus {
  if (tx.journalBatchId) return 'posted';
  if (tx.confirmedAccountId) return 'categorized';
  if (!tx.isExcluded) return 'uncategorized';
  return 'excluded';
}

export function getStatusLabel(status: TransactionStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function getStatusClassName(status: TransactionStatus): string {
  if (status === 'posted') return 'bg-green-50 text-green-700 ring-green-600/20';
  if (status === 'categorized') return 'bg-blue-50 text-blue-700 ring-blue-600/20';
  if (status === 'uncategorized') return 'bg-amber-50 text-amber-700 ring-amber-600/20';
  return 'bg-gray-50 text-gray-600 ring-gray-500/10';
}

export function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthLabel(key: string): string {
  const [year, month] = key.split('-');
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export type AllocationDraft = {
  id: string;
  accountId: string;
  amount: string;
};

export type AllocationValidationResult =
  | { ok: true; allocations: Array<{ accountId: string; amountCents: number }> }
  | { ok: false; error: string };

export function validateAllocationDrafts(
  drafts: AllocationDraft[],
  expectedTotalCents: number,
): AllocationValidationResult {
  const allocations = drafts.map((draft) => ({
    accountId: draft.accountId,
    amountCents: parseCurrencyToCents(draft.amount) ?? 0,
  }));

  for (const allocation of allocations) {
    if (!allocation.accountId) {
      return { ok: false, error: 'Each line needs an account.' };
    }
    if (!allocation.amountCents || allocation.amountCents <= 0) {
      return { ok: false, error: 'Each line needs a positive amount.' };
    }
  }

  const total = allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0);
  if (total !== expectedTotalCents) {
    return {
      ok: false,
      error: `Lines must total ${formatCentsAsCurrency(
        expectedTotalCents,
      )} (currently ${formatCentsAsCurrency(total)}).`,
    };
  }

  return { ok: true, allocations };
}

export function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
