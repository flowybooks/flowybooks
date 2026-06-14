export type CompareMode = 'none' | 'previous_period' | 'previous_year';

export function normalizeCompareMode(value?: string | null): CompareMode {
  if (value === 'previous_period' || value === 'previous_year') {
    return value;
  }
  return 'none';
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function shiftDateByMonths(date: Date, months: number): Date {
  const year = date.getFullYear();
  const monthIndex = date.getMonth() + months;
  const day = date.getDate();
  const lastDayOfTarget = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(day, lastDayOfTarget));
}

export function shiftDateByYears(date: Date, years: number): Date {
  return shiftDateByMonths(date, years * 12);
}

export function getPreviousRange(
  fromDate: Date,
  toDate: Date,
): {
  from: Date;
  to: Date;
} {
  const compareTo = addDays(fromDate, -1);
  const diffMs = toDate.getTime() - fromDate.getTime();
  const compareFrom = new Date(compareTo.getTime() - diffMs);
  return { from: compareFrom, to: compareTo };
}

export function getCompareRange(
  mode: CompareMode,
  fromDate: Date,
  toDate: Date,
): { from: Date; to: Date } | null {
  if (mode === 'previous_period') {
    return getPreviousRange(fromDate, toDate);
  }
  if (mode === 'previous_year') {
    return {
      from: shiftDateByYears(fromDate, -1),
      to: shiftDateByYears(toDate, -1),
    };
  }
  return null;
}

export function getCompareAsOf(mode: CompareMode, asOfDate: Date): Date | null {
  if (mode === 'previous_period') {
    return shiftDateByMonths(asOfDate, -1);
  }
  if (mode === 'previous_year') {
    return shiftDateByYears(asOfDate, -1);
  }
  return null;
}
