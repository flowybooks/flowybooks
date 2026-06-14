import type { Organization } from '@/lib/db/schema';

/**
 * Returns the start and end dates of the fiscal year that contains `asOfDate`.
 *
 * `team.fiscalYearEndMonth` is 1–12 and represents the month in which the year ends:
 * - 1  => year ends January 31
 * - 12 => year ends December 31 (calendar year)
 */
export function getFiscalYearBounds(
  team: Organization,
  asOfDate: Date,
): {
  start: Date;
  end: Date;
} {
  const endMonth = team.fiscalYearEndMonth ?? 12; // 1-12

  const asOfYear = asOfDate.getFullYear();
  const asOfDay = new Date(asOfYear, asOfDate.getMonth(), asOfDate.getDate());

  // Candidate FY end in the current calendar year
  const candidateEnd = new Date(asOfYear, endMonth, 0);

  const endYear = asOfDay <= candidateEnd ? asOfYear : asOfYear + 1;

  // Last day of fiscalYearEndMonth in endYear
  const end = new Date(endYear, endMonth, 0);

  // Start is the day after the previous fiscal year end
  let startYear: number;
  let startMonth: number; // 0-based

  if (endMonth === 12) {
    // FY Jan 1 – Dec 31
    startYear = endYear;
    startMonth = 0; // January
  } else {
    // FY (endMonth+1) – endMonth, spanning two calendar years
    startYear = endYear - 1;
    startMonth = endMonth; // month after endMonth (0-based)
  }

  const start = new Date(startYear, startMonth, 1);

  return { start, end };
}
