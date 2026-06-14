import { describe, expect, it } from 'vitest';
import { isProtectedAppPath } from '../proxy';

describe('isProtectedAppPath', () => {
  it('matches protected app route segments', () => {
    expect(isProtectedAppPath('/dashboard')).toBe(true);
    expect(isProtectedAppPath('/dashboard/reports/balance-sheet')).toBe(true);
  });

  it('does not match public or similarly-prefixed routes', () => {
    expect(isProtectedAppPath('/')).toBe(false);
    expect(isProtectedAppPath('/sign-in')).toBe(false);
    expect(isProtectedAppPath('/dashboard-auth')).toBe(false);
    expect(isProtectedAppPath('/statement-imports/new')).toBe(false);
    expect(isProtectedAppPath('/journal')).toBe(false);
    expect(isProtectedAppPath('/reports-old')).toBe(false);
  });
});
