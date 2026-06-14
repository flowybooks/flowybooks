import { describe, expect, it } from 'vitest';
import { normalizeTransactionAmountsForStatementType } from '@/lib/imports/statement-import/transaction-normalizer';

describe('normalizeTransactionAmountsForStatementType', () => {
  it('keeps bank statements untouched', () => {
    const txs = [
      { description: 'Deposit', rawDescription: 'Deposit', amountCents: 1000, date: '2024-01-01' },
      { description: 'Payment', rawDescription: 'Payment', amountCents: -2000, date: '2024-01-02' },
    ];

    const result = normalizeTransactionAmountsForStatementType(txs, 'bank_statement');
    expect(result).toEqual(txs);
  });

  it('treats interest charged as a charge even if misclassified', () => {
    const txs = [
      {
        description: 'Interest Charge on Pay Over Time Purchases',
        rawDescription: 'Interest Charge on Pay Over Time Purchases',
        amountCents: 38221,
        date: '2024-01-10',
      },
    ];

    const result = normalizeTransactionAmountsForStatementType(txs, 'bank_statement');

    expect(result[0]?.amountCents).toBe(-38221);
  });

  it('flips signs appropriately for credit card statements', () => {
    const txs = [
      {
        description: 'PAYMENT RECEIVED THANK YOU',
        rawDescription: 'PAYMENT RECEIVED THANK YOU',
        amountCents: -12345,
        date: '2024-01-05',
      },
      {
        description: 'ONLINE PURCHASE',
        rawDescription: 'ONLINE PURCHASE',
        amountCents: -6789,
        date: '2024-01-06',
      },
      {
        description: 'Bank Checking xx0212',
        rawDescription: 'AUTOPAY',
        amountCents: -2127,
        date: '2024-01-07',
      },
    ];

    const result = normalizeTransactionAmountsForStatementType(txs, 'credit_card_statement');

    const payment = result[0];
    const purchase = result[1];
    const autopay = result[2];
    if (!payment || !purchase || !autopay) {
      throw new Error('Expected normalized payment, purchase, and autopay transactions');
    }

    expect(payment.amountCents).toBeGreaterThan(0);
    expect(purchase.amountCents).toBeLessThan(0);
    expect(autopay.amountCents).toBeGreaterThan(0);
  });

  it('treats interest charged as a charge (negative)', () => {
    const txs = [
      {
        description: 'INTEREST CHARGED',
        rawDescription: 'INTEREST CHARGED',
        amountCents: 199,
        date: '2024-01-08',
      },
      {
        description: 'Interest charged',
        rawDescription: 'Interest charged',
        amountCents: -299,
        date: '2024-01-09',
      },
      {
        description: 'Interest\u00A0Charge on Pay Over Time Purchases',
        rawDescription: 'Interest\u00A0Charge on Pay Over Time Purchases',
        amountCents: 38221,
        date: '2024-01-10',
      },
    ];

    const result = normalizeTransactionAmountsForStatementType(txs, 'credit_card_statement');

    expect(result[0]?.amountCents).toBeLessThan(0);
    expect(result[0]?.amountCents).toBe(-199);
    expect(result[1]?.amountCents).toBeLessThan(0);
    expect(result[1]?.amountCents).toBe(-299);
    expect(result[2]?.amountCents).toBe(-38221);
  });
});
