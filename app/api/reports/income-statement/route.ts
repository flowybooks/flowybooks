import { READ_TEAM_ROLES, withApiTeamRole } from '@/lib/auth/api';
import { getFiscalYearBounds } from '@/lib/accounting/reports/fiscal-year';
import { getIncomeStatement } from '@/lib/accounting/reports/income-statement';

function parseDateParam(value: string | null): Date | null {
  if (!value) return null;
  const parts = value.split('-');
  if (parts.length !== 3) return null;
  const [yearStr, monthStr, dayStr] = parts;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function getDefaultPeriodEnd(): Date {
  const today = new Date();
  // Last day of the previous month
  return new Date(today.getFullYear(), today.getMonth(), 0);
}

export const GET = withApiTeamRole(READ_TEAM_ROLES, async ({ team }, request) => {
  const url = new URL(request.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');

  const parsedTo = parseDateParam(toParam);
  if (toParam && !parsedTo) {
    return Response.json({ error: 'Invalid to date' }, { status: 400 });
  }
  const toDate = parsedTo ?? getDefaultPeriodEnd();

  let fromDate: Date;
  const parsedFrom = parseDateParam(fromParam);
  if (fromParam && !parsedFrom) {
    return Response.json({ error: 'Invalid from date' }, { status: 400 });
  }

  if (parsedFrom) {
    fromDate = parsedFrom;
  } else {
    const { start } = getFiscalYearBounds(team, toDate);
    fromDate = start;
  }

  if (fromDate > toDate) {
    return Response.json({ error: 'from date must be on or before to date' }, { status: 400 });
  }

  const result = await getIncomeStatement({ team, fromDate, toDate });

  return Response.json({
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    accounts: result.accounts,
    totals: result.totals,
  });
});
