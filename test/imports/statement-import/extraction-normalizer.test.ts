import { describe, expect, it } from 'vitest';
import { statementExtractionSchema } from '@/lib/imports/statement-import/extractors/schemas';
import {
  normalizeDateToYmd,
  normalizeStatementExtraction,
} from '@/lib/imports/statement-import/extraction-normalizer';

describe('normalizeDateToYmd', () => {
  it('normalizes YYYY-M-D and MM/DD/YYYY to YYYY-MM-DD', () => {
    expect(normalizeDateToYmd('2025-1-5')).toBe('2025-01-05');
    expect(normalizeDateToYmd('1/5/2025')).toBe('2025-01-05');
    expect(normalizeDateToYmd('01/05/25')).toBe('2025-01-05');
  });

  it('normalizes month-name dates', () => {
    expect(normalizeDateToYmd('December 4, 2025')).toBe('2025-12-04');
    expect(normalizeDateToYmd('Dec 4 2025')).toBe('2025-12-04');
  });

  it('returns null for invalid dates', () => {
    expect(normalizeDateToYmd('2025-13-01')).toBeNull();
    expect(normalizeDateToYmd('not a date')).toBeNull();
  });
});

describe('normalizeStatementExtraction', () => {
  it('normalizes dates/amounts and records issues', () => {
    const result = normalizeStatementExtraction({
      metadata: {
        statementType: 'bank_statement',
        institutionName: '  Test Bank  ',
        accountNumber: ' 1234 ',
        startDate: '01/01/2025',
        endDate: 'January 31, 2025',
        beginningBalanceCents: '$30,200.49' as any,
        endingBalanceCents: 21_252.08 as any,
      } as any,
      transactions: [
        {
          date: '1/5/2025',
          description: ' Dividend ',
          rawDescription: 'Dividend',
          amountCents: '$35.57' as any,
        } as any,
        {
          date: '2025-13-01',
          description: 'Bad date',
          rawDescription: 'Bad date',
          amountCents: 100,
        },
      ],
    });

    expect(result.metadata.institutionName).toBe('Test Bank');
    expect(result.metadata.accountNumber).toBe('1234');
    expect(result.metadata.startDate).toBe('2025-01-01');
    expect(result.metadata.endDate).toBe('2025-01-31');
    expect(result.metadata.beginningBalanceCents).toBe(3_020_049);
    expect(result.metadata.endingBalanceCents).toBe(2_125_208);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.date).toBe('2025-01-05');
    expect(result.transactions[0]?.amountCents).toBe(3_557);
    expect(result.issues.some((i) => i.code === 'invalid_transaction_date')).toBe(true);
  });

  it('warns when statement period is missing', () => {
    const result = normalizeStatementExtraction({
      metadata: {
        statementType: 'bank_statement',
        institutionName: null,
        accountNumber: null,
        startDate: null,
        endDate: null,
        beginningBalanceCents: null,
        endingBalanceCents: null,
      },
      transactions: [],
    });

    expect(result.issues.some((i) => i.code === 'missing_statement_period')).toBe(true);
  });
});

describe('statementExtractionSchema', () => {
  it('does not hard-fail when transactions are outside the statement period', () => {
    const parsed = statementExtractionSchema.parse({
      metadata: {
        statementType: 'bank_statement',
        institutionName: null,
        accountNumber: null,
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        beginningBalanceCents: 0,
        endingBalanceCents: 0,
      },
      transactions: [
        {
          date: '2024-12-31',
          description: 'Outside period',
          rawDescription: 'Outside period',
          amountCents: 0,
        },
      ],
    });

    expect(parsed.transactions).toHaveLength(1);
  });
});
