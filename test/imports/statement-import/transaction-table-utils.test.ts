import { describe, expect, it } from 'vitest';

import {
  formatMonthLabel,
  getMonthKey,
  getTransactionStatus,
  parseCurrencyToCents,
  validateAllocationDrafts,
} from '@/app/(site)/dashboard/statement-imports/[id]/transaction-table-utils';
import type { Transaction } from '@/app/(site)/dashboard/statement-imports/[id]/transaction-table-types';

function makeTransaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'tx_1',
    lineNumber: 1,
    transactionDate: new Date('2026-01-15T00:00:00.000Z'),
    description: 'Test transaction',
    rawDescription: 'TEST TRANSACTION',
    amountCents: 12_34,
    checkNumber: null,
    suggestedAccountId: null,
    categoryConfidence: null,
    confirmedAccountId: null,
    allocations: null,
    isExcluded: false,
    journalBatchId: null,
    ...overrides,
  };
}

describe('transaction table utilities', () => {
  it('parses common currency strings to cents', () => {
    expect(parseCurrencyToCents('12.34')).toBe(1234);
    expect(parseCurrencyToCents('$1,234.56')).toBe(123456);
    expect(parseCurrencyToCents('')).toBeNull();
    expect(parseCurrencyToCents('not a number')).toBeNull();
  });

  it('classifies transaction review status', () => {
    expect(getTransactionStatus(makeTransaction({ journalBatchId: 'journal_1' }))).toBe('posted');
    expect(getTransactionStatus(makeTransaction({ confirmedAccountId: 'acct_1' }))).toBe(
      'categorized',
    );
    expect(getTransactionStatus(makeTransaction({ isExcluded: false }))).toBe('uncategorized');
    expect(getTransactionStatus(makeTransaction({ isExcluded: true }))).toBe('excluded');
  });

  it('groups dates by month key and label', () => {
    const key = getMonthKey(new Date('2026-03-10T12:00:00.000Z'));
    expect(key).toBe('2026-03');
    expect(formatMonthLabel(key)).toBe('March 2026');
  });

  it('validates split allocations against the transaction total', () => {
    expect(
      validateAllocationDrafts(
        [
          { id: 'a', accountId: 'acct_1', amount: '10.00' },
          { id: 'b', accountId: 'acct_2', amount: '5.25' },
        ],
        1525,
      ),
    ).toEqual({
      ok: true,
      allocations: [
        { accountId: 'acct_1', amountCents: 1000 },
        { accountId: 'acct_2', amountCents: 525 },
      ],
    });

    expect(
      validateAllocationDrafts([{ id: 'a', accountId: 'acct_1', amount: '10.00' }], 1525),
    ).toEqual({
      ok: false,
      error: 'Lines must total $15.25 (currently $10.00).',
    });
  });
});
