import { describe, it, expect } from 'vitest';
import { getFiscalYearBounds } from '../../lib/accounting/reports/fiscal-year';
import type { Organization } from '../../lib/db/schema';

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

describe('getFiscalYearBounds', () => {
  it('returns calendar year bounds when fiscalYearEndMonth is 12', () => {
    const team = { fiscalYearEndMonth: 12 } as Organization;
    const asOfDate = new Date('2025-06-15T00:00:00.000Z');

    const { start, end } = getFiscalYearBounds(team, asOfDate);

    expect(isoDate(start)).toBe('2025-01-01');
    expect(isoDate(end)).toBe('2025-12-31');
  });

  it('returns correct bounds for non-December fiscal year', () => {
    const team = { fiscalYearEndMonth: 3 } as Organization; // FY ends March 31
    const asOfDate = new Date('2025-05-10T00:00:00.000Z');

    const { start, end } = getFiscalYearBounds(team, asOfDate);

    // FY: April 1, 2025 – March 31, 2026
    expect(isoDate(start)).toBe('2025-04-01');
    expect(isoDate(end)).toBe('2026-03-31');
  });
});
