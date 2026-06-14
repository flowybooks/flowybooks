import { describe, expect, it } from 'vitest';
import { parseSpreadsheetStatement } from '@/lib/imports/statement-import/spreadsheet-parser';

const sampleCsv = `Transaction Date,Description,Amount
2024-01-01,Payment Received,-123.45
2024-01-02,Online Purchase,67.89
`;

const sampleCsvDebitCredit = `Date,Memo,Debit,Credit
2024-02-01,STORE PURCHASE,45.67,
2024-02-02,PAYMENT,,120.00
`;

const sampleDateFormatCsv = `Date,Description,Amount
11-19-2025,Payment Received,21.27
11-11-2025,Coffee Shop,-21.27
`;

describe('parseSpreadsheetStatement', () => {
  it('parses basic amount column', () => {
    const buffer = Buffer.from(sampleCsv, 'utf-8');
    const result = parseSpreadsheetStatement({
      fileName: 'sample.csv',
      buffer,
      statementType: 'bank_statement',
    });
    expect(result.transactions).toHaveLength(2);
    const [t1, t2] = result.transactions;
    if (!t1 || !t2) {
      throw new Error('Expected two parsed transactions');
    }
    expect(t1.amountCents).toBe(-12345);
    expect(t2.amountCents).toBe(6789);
  });

  it('parses debit/credit split and applies signs', () => {
    const buffer = Buffer.from(sampleCsvDebitCredit, 'utf-8');
    const result = parseSpreadsheetStatement({
      fileName: 'sample.csv',
      buffer,
      statementType: 'bank_statement',
    });
    expect(result.transactions).toHaveLength(2);
    const [debit, credit] = result.transactions;
    if (!debit || !credit) {
      throw new Error('Expected debit and credit transactions');
    }
    expect(debit.amountCents).toBeLessThan(0);
    expect(credit.amountCents).toBeGreaterThan(0);
  });

  it('parses mm-dd-yyyy without shifting dates', () => {
    const buffer = Buffer.from(sampleDateFormatCsv, 'utf-8');
    const result = parseSpreadsheetStatement({
      fileName: 'sample.csv',
      buffer,
      statementType: 'bank_statement',
    });
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]?.date).toBe('2025-11-19');
    expect(result.transactions[1]?.date).toBe('2025-11-11');
  });
});
