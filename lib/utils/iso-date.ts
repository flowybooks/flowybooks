import { parseAccountingDateKey } from './accounting-date';

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDateString(value: string): boolean {
  return ISO_DATE_RE.test(value);
}

export function parseIsoDateParam(value: string | null | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const match = ISO_DATE_RE.exec(value);
  if (!match) return fallback;

  return parseAccountingDateKey(value) ?? fallback;
}

export function parseIsoDateParamOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const invalidFallback = new Date(0);
  const parsed = parseIsoDateParam(value, invalidFallback);
  return parsed === invalidFallback ? null : parsed;
}
