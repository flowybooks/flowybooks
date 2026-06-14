export type RangePeriodMode =
  | 'last_month'
  | 'last_quarter'
  | 'current_month'
  | 'year_to_date'
  | 'last_year'
  | 'custom';

export const RANGE_PERIOD_OPTIONS: Array<{
  value: Exclude<RangePeriodMode, 'custom'>;
  label: string;
}> = [
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'current_month', label: 'Current Month' },
  { value: 'year_to_date', label: 'Year-To-Date' },
  { value: 'last_year', label: 'Last Year' },
];

export type AsOfPeriodMode =
  | 'last_month'
  | 'last_quarter'
  | 'year_to_date'
  | 'last_year'
  | 'custom';

export const AS_OF_PERIOD_OPTIONS: Array<{
  value: Exclude<AsOfPeriodMode, 'custom'>;
  label: string;
}> = [
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'year_to_date', label: 'Year-To-Date' },
  { value: 'last_year', label: 'Last Year' },
];

function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function getFiscalYearBounds(
  fiscalYearEndMonth: number | null | undefined,
  asOfDate: Date,
): { start: Date; end: Date } {
  const endMonth = fiscalYearEndMonth ?? 12; // 1-12
  const asOfYear = asOfDate.getFullYear();
  const asOfDay = new Date(asOfYear, asOfDate.getMonth(), asOfDate.getDate());
  const candidateEnd = new Date(asOfYear, endMonth, 0);
  const endYear = asOfDay <= candidateEnd ? asOfYear : asOfYear + 1;
  const end = new Date(endYear, endMonth, 0);

  const start = endMonth === 12 ? new Date(endYear, 0, 1) : new Date(endYear - 1, endMonth, 1);

  return { start, end };
}

function getLastFiscalQuarterRange(
  today: Date,
  fiscalYearEndMonth: number | null | undefined,
): { start: Date; end: Date } {
  const { start: fiscalYearStart } = getFiscalYearBounds(fiscalYearEndMonth, today);
  const monthsSinceStart =
    (today.getFullYear() - fiscalYearStart.getFullYear()) * 12 +
    (today.getMonth() - fiscalYearStart.getMonth());
  const currentQuarterIndex = Math.floor(monthsSinceStart / 3);
  const currentQuarterStart = new Date(
    fiscalYearStart.getFullYear(),
    fiscalYearStart.getMonth() + currentQuarterIndex * 3,
    1,
  );

  const start = new Date(currentQuarterStart.getFullYear(), currentQuarterStart.getMonth() - 3, 1);
  const end = new Date(currentQuarterStart.getFullYear(), currentQuarterStart.getMonth(), 0);
  return { start, end };
}

function getLastFiscalYearRange(
  today: Date,
  fiscalYearEndMonth: number | null | undefined,
): { start: Date; end: Date } {
  const currentFiscalYear = getFiscalYearBounds(fiscalYearEndMonth, today);
  const dayBeforeCurrentStart = new Date(currentFiscalYear.start);
  dayBeforeCurrentStart.setDate(dayBeforeCurrentStart.getDate() - 1);
  return getFiscalYearBounds(fiscalYearEndMonth, dayBeforeCurrentStart);
}

export function getRangeForPeriod(
  mode: Exclude<RangePeriodMode, 'custom'>,
  today: Date,
  fiscalYearEndMonth: number | null | undefined,
): { from: string; to: string } {
  if (mode === 'current_month') {
    return {
      from: formatDateInputValue(startOfMonth(today)),
      to: formatDateInputValue(today),
    };
  }

  if (mode === 'year_to_date') {
    const { start } = getFiscalYearBounds(fiscalYearEndMonth, today);
    return {
      from: formatDateInputValue(start),
      to: formatDateInputValue(today),
    };
  }

  if (mode === 'last_year') {
    const lastFiscalYear = getLastFiscalYearRange(today, fiscalYearEndMonth);
    return {
      from: formatDateInputValue(lastFiscalYear.start),
      to: formatDateInputValue(lastFiscalYear.end),
    };
  }

  if (mode === 'last_quarter') {
    const lastQuarter = getLastFiscalQuarterRange(today, fiscalYearEndMonth);
    return {
      from: formatDateInputValue(lastQuarter.start),
      to: formatDateInputValue(lastQuarter.end),
    };
  }

  // last_month
  const previousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return {
    from: formatDateInputValue(startOfMonth(previousMonth)),
    to: formatDateInputValue(endOfMonth(previousMonth)),
  };
}

export function normalizeRangePeriodMode(value: string | null): RangePeriodMode | null {
  if (!value) return null;
  if (value === 'custom') return 'custom';
  const match = RANGE_PERIOD_OPTIONS.find((option) => option.value === value);
  return match ? match.value : null;
}

export function inferRangePeriodMode(params: {
  from: string;
  to: string;
  today: Date;
  fiscalYearEndMonth: number | null | undefined;
}): RangePeriodMode {
  const { from, to, today, fiscalYearEndMonth } = params;

  for (const option of RANGE_PERIOD_OPTIONS) {
    const range = getRangeForPeriod(option.value, today, fiscalYearEndMonth);
    if (range.from === from && range.to === to) {
      return option.value;
    }
  }

  return 'custom';
}

export function getAsOfForPeriod(
  mode: Exclude<AsOfPeriodMode, 'custom'>,
  today: Date,
  fiscalYearEndMonth: number | null | undefined,
): string {
  if (mode === 'year_to_date') {
    return formatDateInputValue(today);
  }

  if (mode === 'last_year') {
    const lastFiscalYear = getLastFiscalYearRange(today, fiscalYearEndMonth);
    return formatDateInputValue(lastFiscalYear.end);
  }

  if (mode === 'last_quarter') {
    const lastQuarter = getLastFiscalQuarterRange(today, fiscalYearEndMonth);
    return formatDateInputValue(lastQuarter.end);
  }

  // last_month
  const previousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return formatDateInputValue(endOfMonth(previousMonth));
}

export function normalizeAsOfPeriodMode(value: string | null): AsOfPeriodMode | null {
  if (!value) return null;
  if (value === 'custom') return 'custom';
  const match = AS_OF_PERIOD_OPTIONS.find((option) => option.value === value);
  return match ? match.value : null;
}

export function inferAsOfPeriodMode(params: {
  asOf: string;
  today: Date;
  fiscalYearEndMonth: number | null | undefined;
}): AsOfPeriodMode {
  const { asOf, today, fiscalYearEndMonth } = params;

  for (const option of AS_OF_PERIOD_OPTIONS) {
    const value = getAsOfForPeriod(option.value, today, fiscalYearEndMonth);
    if (value === asOf) {
      return option.value;
    }
  }

  return 'custom';
}
