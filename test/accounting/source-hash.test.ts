import { describe, expect, it } from 'vitest';
import { hashJournalSource, hashJsonValue } from '../../lib/utils/hash';

describe('journal source hashing', () => {
  it('produces distinct hashes for distinct nested source refs', () => {
    const baseline = hashJournalSource('opening_balance', {
      asOfDate: '2024-12-31T00:00:00.000Z',
      booksStartDate: '2025-01-01T00:00:00.000Z',
      includesPnl: false,
    });

    const changed = hashJournalSource('opening_balance', {
      asOfDate: '2024-12-31T00:00:00.000Z',
      booksStartDate: '2025-02-01T00:00:00.000Z',
      includesPnl: false,
    });

    expect(baseline).not.toBe(changed);
  });

  it('is stable across object key order at all levels', () => {
    const first = hashJsonValue({
      outer: { b: 2, a: 1 },
      nestedList: [{ z: 26, y: 25 }],
    });

    const second = hashJsonValue({
      outer: { a: 1, b: 2 },
      nestedList: [{ y: 25, z: 26 }],
    });

    expect(first).toBe(second);
  });
});
