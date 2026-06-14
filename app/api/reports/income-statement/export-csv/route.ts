import { READ_TEAM_ROLES, withApiTeamRole } from '@/lib/auth/api';
import { getIncomeStatement } from '@/lib/accounting/reports/income-statement';
import { getFiscalYearBounds } from '@/lib/accounting/reports/fiscal-year';
import { buildCsv } from '@/lib/utils/csv';

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
  return new Date(today.getFullYear(), today.getMonth() + 1, 0);
}

function formatDollarsFromCents(value: number): string {
  return (value / 100).toFixed(2);
}

export const GET = withApiTeamRole(READ_TEAM_ROLES, async ({ team }, request) => {
  const url = new URL(request.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');

  const toDate = parseDateParam(toParam) ?? getDefaultPeriodEnd();
  let fromDate = parseDateParam(fromParam);
  if (!fromDate) {
    const { start } = getFiscalYearBounds(team, toDate);
    fromDate = start;
  }

  const result = await getIncomeStatement({ team, fromDate, toDate });

  const incomeAccounts = result.accounts.filter((acc) => acc.periodAmount > 0 || acc.ytdAmount > 0);
  const expenseAccounts = result.accounts.filter(
    (acc) => acc.periodAmount < 0 || acc.ytdAmount < 0,
  );

  const periodIncome = incomeAccounts.reduce((sum, acc) => sum + acc.periodAmount, 0);
  const periodExpenses = Math.abs(expenseAccounts.reduce((sum, acc) => sum + acc.periodAmount, 0));
  const ytdIncome = incomeAccounts.reduce((sum, acc) => sum + acc.ytdAmount, 0);
  const ytdExpenses = Math.abs(expenseAccounts.reduce((sum, acc) => sum + acc.ytdAmount, 0));

  const rows: Array<Array<string | number>> = [];

  incomeAccounts.forEach((row) => {
    rows.push([
      'Income',
      row.code ?? '',
      row.name,
      formatDollarsFromCents(row.periodAmount),
      formatDollarsFromCents(row.ytdAmount),
    ]);
  });

  rows.push([
    'Income',
    '',
    'Total Income',
    formatDollarsFromCents(periodIncome),
    formatDollarsFromCents(ytdIncome),
  ]);

  expenseAccounts.forEach((row) => {
    rows.push([
      'Expenses',
      row.code ?? '',
      row.name,
      formatDollarsFromCents(Math.abs(row.periodAmount)),
      formatDollarsFromCents(Math.abs(row.ytdAmount)),
    ]);
  });

  rows.push([
    'Expenses',
    '',
    'Total Expenses',
    formatDollarsFromCents(periodExpenses),
    formatDollarsFromCents(ytdExpenses),
  ]);

  rows.push([
    'Totals',
    '',
    'Net Income',
    formatDollarsFromCents(result.totals.periodNetIncome),
    formatDollarsFromCents(result.totals.ytdNetIncome),
  ]);

  const csv = buildCsv(['Section', 'Code', 'Account', 'Period', 'YTD'], rows);
  const filenameDate = toDate.toISOString().slice(0, 10);
  const filename = `income-statement-${filenameDate}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});
