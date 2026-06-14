// This test file checks that journal form parsing still works after the refactor.
// It protects rules like balanced journal entries, CSV parsing, and opening-balance
// imports so we can reorganize code without accidentally changing behavior.

import { describe, expect, it } from 'vitest';
import {
  getBalanceMessage,
  parseCreateDraftJournalFormData,
  parseCsvRows,
  parseOpeningBalanceCsvText,
} from '@/app/(site)/dashboard/journal/_lib/journal-form-data';
import { getStoredAccountingDateKey } from '@/lib/utils/accounting-date';

describe('journal form data helpers', () => {
  it('parses a balanced draft journal form and uses the earliest GL date', () => {
    const formData = new FormData();
    formData.set('narration', 'Month-end accrual');
    formData.set('rowCount', '4');
    formData.set('accountId_0', 'cash');
    formData.set('lineDescription_0', 'Cash');
    formData.set('lineGlDate_0', '2026-01-31');
    formData.set('debit_0', '125.00');
    formData.set('credit_0', '');
    formData.set('accountId_1', 'revenue');
    formData.set('lineDescription_1', 'Revenue');
    formData.set('lineGlDate_1', '2026-01-31');
    formData.set('debit_1', '');
    formData.set('credit_1', '125.00');
    formData.set('accountId_2', 'cash');
    formData.set('lineDescription_2', 'Cash');
    formData.set('lineGlDate_2', '2026-01-30');
    formData.set('debit_2', '50.00');
    formData.set('credit_2', '');
    formData.set('accountId_3', 'revenue');
    formData.set('lineDescription_3', 'Revenue');
    formData.set('lineGlDate_3', '2026-01-30');
    formData.set('debit_3', '');
    formData.set('credit_3', '50.00');

    const parsed = parseCreateDraftJournalFormData(formData);

    expect(parsed.description).toBe('Month-end accrual');
    expect(parsed.lines).toHaveLength(4);
    expect(parsed.lines[0] ? getStoredAccountingDateKey(parsed.lines[0].glDate) : null).toBe(
      '2026-01-31',
    );
    expect(getStoredAccountingDateKey(parsed.date)).toBe('2026-01-30');
  });

  it('reports the specific out-of-balance date', () => {
    const message = getBalanceMessage([
      {
        accountId: 'cash',
        glDate: new Date('2026-01-31'),
        debit: 10_000,
        credit: 0,
      },
      {
        accountId: 'revenue',
        glDate: new Date('2026-01-31'),
        debit: 0,
        credit: 9_500,
      },
    ]);

    expect(message).toContain('Out of balance on');
    expect(message).toContain('difference: $5.00');
  });

  it('parses CSV rows with quoted delimiters and escaped quotes', () => {
    const rows = parseCsvRows(
      'Account Code,Description,Debit\n1000,"Cash, operating",100.00\n2000,"He said ""hello""",0',
      ',',
    );

    expect(rows).toEqual([
      ['Account Code', 'Description', 'Debit'],
      ['1000', 'Cash, operating', '100.00'],
      ['2000', 'He said "hello"', '0'],
    ]);
  });

  it('parses opening balance CSV content using normalized headers', () => {
    const accountByCode = new Map<string, string>([
      ['1000', 'cash-account'],
      ['2000', 'revenue-account'],
    ]);

    const lines = parseOpeningBalanceCsvText(
      'Account Code,Description,Debit,Credit\n1000,Opening cash,100.00,\n2000,Opening revenue,,100.00',
      accountByCode,
    );

    expect(lines).toEqual([
      {
        accountId: 'cash-account',
        debit: 10_000,
        credit: 0,
        narration: 'Opening cash',
      },
      {
        accountId: 'revenue-account',
        debit: 0,
        credit: 10_000,
        narration: 'Opening revenue',
      },
    ]);
  });
});
