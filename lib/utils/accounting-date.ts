const ISO_DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateKeyParts(value: string): { year: number; month: number; day: number } | null {
  const match = ISO_DATE_KEY_RE.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isInteger(year) || year < 1900 || year > 2100) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;

  const candidate = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

export function parseAccountingDateKey(value: string): Date | null {
  const parts = parseDateKeyParts(value.trim());
  if (!parts) return null;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
}

export function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getStoredAccountingDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function startOfAccountingDateUtc(date: Date): Date {
  const [year = 0, month = 1, day = 1] = getLocalDateKey(date).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function formatDateKeyForDisplay(
  dateKey: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const parts = parseDateKeyParts(dateKey);
  if (!parts) return dateKey;
  return new Date(parts.year, parts.month - 1, parts.day).toLocaleDateString('en-US', options);
}

export function formatStoredAccountingDate(
  date: Date | string | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!date) return '-';
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return '-';
  return formatDateKeyForDisplay(getStoredAccountingDateKey(parsed), options);
}
