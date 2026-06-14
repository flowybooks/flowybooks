import { describe, it, expect } from 'vitest';
import { calculateJournalTotals, canPostJournal } from '../../lib/accounting/journals';

describe('calculateJournalTotals', () => {
  it('sums debits and credits correctly', () => {
    const { totalDebit, totalCredit } = calculateJournalTotals([
      { debit: 10000, credit: 0 }, // 100.00
      { debit: 0, credit: 2500 }, // 25.00
      { debit: 5000, credit: 0 }, // 50.00
    ]);

    expect(totalDebit).toBe(15000);
    expect(totalCredit).toBe(2500);
  });

  it('treats undefined values as zero', () => {
    const { totalDebit, totalCredit } = calculateJournalTotals([
      { debit: 1000, credit: undefined as any },
      { debit: undefined as any, credit: 2000 },
    ]);

    expect(totalDebit).toBe(1000);
    expect(totalCredit).toBe(2000);
  });
});

describe('canPostJournal', () => {
  it('returns false for empty journal', () => {
    expect(canPostJournal([])).toBe(false);
  });

  it('rejects lines with negative amounts', () => {
    expect(
      canPostJournal([
        { debit: -1000, credit: 0 },
        { debit: 0, credit: 1000 },
      ]),
    ).toBe(false);
  });

  it('rejects lines with both debit and credit > 0', () => {
    expect(canPostJournal([{ debit: 1000, credit: 1000 }])).toBe(false);
  });

  it('rejects lines with both debit and credit = 0', () => {
    expect(canPostJournal([{ debit: 0, credit: 0 }])).toBe(false);
  });

  it('rejects unbalanced totals', () => {
    expect(
      canPostJournal([
        { debit: 1000, credit: 0 },
        { debit: 0, credit: 500 },
      ]),
    ).toBe(false);
  });

  it('accepts a balanced journal with valid lines', () => {
    expect(
      canPostJournal([
        { debit: 1000, credit: 0 },
        { debit: 0, credit: 600 },
        { debit: 0, credit: 400 },
      ]),
    ).toBe(true);
  });
});
