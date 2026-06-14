import { parseAccountingDateKey } from '@/lib/utils/accounting-date';

export function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n[truncated]`;
}

export function centsToDisplay(cents: number) {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

export function parseKevinAccountingDate(date: string): Date {
  const parsed = parseAccountingDateKey(date);
  if (!parsed) {
    throw new Error(`Invalid journal date: ${date}`);
  }
  return parsed;
}
