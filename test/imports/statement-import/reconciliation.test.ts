import { describe, expect, it } from 'vitest';
import { reconcileStatementActivity } from '@/lib/imports/statement-import/reconciliation';

describe('reconcileStatementActivity', () => {
  it('reconciles when transactions match balance delta', () => {
    const result = reconcileStatementActivity({
      metadata: {
        statementType: 'bank_statement',
        institutionName: 'Test Bank',
        accountNumber: '1234',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        beginningBalanceCents: 3_020_049,
        endingBalanceCents: 2_125_208,
      },
      transactions: [
        {
          date: '2025-01-05',
          description: 'Dividend',
          rawDescription: 'Dividend',
          amountCents: 3_557,
        },
        {
          date: '2025-01-10',
          description: 'Interest',
          rawDescription: 'Interest',
          amountCents: 2_347,
        },
        {
          date: '2025-01-15',
          description: 'Wire out',
          rawDescription: 'Wire out',
          amountCents: -200_000,
        },
        {
          date: '2025-01-20',
          description: 'Wire out',
          rawDescription: 'Wire out',
          amountCents: -700_000,
        },
        {
          date: '2025-01-25',
          description: 'Advisory fee',
          rawDescription: 'Advisory fee',
          amountCents: -745,
        },
      ],
    });

    expect(result.status).toBe('ok');
    expect(result.diffCents).toBe(0);
    expect(result.expectedDeltaCents).toBe(-894_841);
    expect(result.capturedDeltaCents).toBe(-894_841);
  });

  it('flags mismatch when non-booked fees are mistakenly included as transactions', () => {
    const result = reconcileStatementActivity({
      metadata: {
        statementType: 'bank_statement',
        institutionName: 'Test Bank',
        accountNumber: '1234',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        beginningBalanceCents: 3_020_049,
        endingBalanceCents: 2_125_208,
      },
      transactions: [
        {
          date: '2025-01-05',
          description: 'Dividend',
          rawDescription: 'Dividend',
          amountCents: 3_557,
        },
        {
          date: '2025-01-10',
          description: 'Interest',
          rawDescription: 'Interest',
          amountCents: 2_347,
        },
        {
          date: '2025-01-15',
          description: 'Wire out',
          rawDescription: 'Wire out',
          amountCents: -200_000,
        },
        {
          date: '2025-01-20',
          description: 'Wire out',
          rawDescription: 'Wire out',
          amountCents: -700_000,
        },
        {
          date: '2025-01-25',
          description: 'Advisory fee',
          rawDescription: 'Advisory fee',
          amountCents: -745,
        },
        {
          date: '2025-01-25',
          description: 'Wire fee',
          rawDescription: 'Wire fee',
          amountCents: -1_200,
        },
        {
          date: '2025-01-25',
          description: 'Wire fee',
          rawDescription: 'Wire fee',
          amountCents: -1_200,
        },
      ],
    });

    expect(result.status).toBe('warning');
    expect(result.diffCents).toBe(2_400);
  });

  it('allows non-transaction adjustments for reconciliation (e.g., unrealized gain/loss)', () => {
    const result = reconcileStatementActivity({
      metadata: {
        statementType: 'bank_statement',
        institutionName: 'Test Broker',
        accountNumber: '9999',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        beginningBalanceCents: 10_000,
        endingBalanceCents: 11_000,
        reconciliationAdjustments: [{ description: 'Unrealized gain/loss', amountCents: 800 }],
      },
      transactions: [
        {
          date: '2025-01-10',
          description: 'Dividend',
          rawDescription: 'Dividend',
          amountCents: 200,
        },
      ],
    });

    expect(result.status).toBe('ok');
    expect(result.diffCents).toBe(0);
    expect(result.expectedDeltaCents).toBe(1_000);
    expect(result.capturedDeltaCents).toBe(1_000);
  });

  it('warns when balances are missing', () => {
    const result = reconcileStatementActivity({
      metadata: {
        statementType: 'bank_statement',
        institutionName: 'Test Bank',
        accountNumber: '1234',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        beginningBalanceCents: null,
        endingBalanceCents: null,
      },
      transactions: [],
    });

    expect(result.status).toBe('warning');
    expect(result.expectedDeltaCents).toBeNull();
    expect(result.diffCents).toBeNull();
  });
});
