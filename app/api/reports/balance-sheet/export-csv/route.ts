import { READ_TEAM_ROLES, withApiTeamRole } from '@/lib/auth/api';
import { getBalanceSheet } from '@/lib/accounting/reports/balance-sheet';
import { buildCsv } from '@/lib/utils/csv';

function parseDateParam(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const parts = value.split('-');
  if (parts.length !== 3) return fallback;
  const [yearStr, monthStr, dayStr] = parts;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!year || !month || !day) return fallback;
  return new Date(year, month - 1, day);
}

function getDefaultAsOfDate(): Date {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth() + 1, 0);
}

function formatDollarsFromCents(value: number): string {
  return (value / 100).toFixed(2);
}

export const GET = withApiTeamRole(READ_TEAM_ROLES, async ({ team }, request) => {
  const url = new URL(request.url);
  const asOfParam = url.searchParams.get('asOf');
  const asOfDate = parseDateParam(asOfParam, getDefaultAsOfDate());

  const result = await getBalanceSheet({ team, asOfDate });

  const rows: Array<Array<string | number>> = [];

  const pushSection = (section: string, items: typeof result.assets) => {
    items.forEach((row) => {
      rows.push([section, row.code ?? '', row.name, formatDollarsFromCents(row.amount)]);
    });
  };

  pushSection('Assets', result.assets);
  rows.push(['Assets', '', 'Total Assets', formatDollarsFromCents(result.totals.assets)]);

  pushSection('Liabilities', result.liabilities);
  rows.push([
    'Liabilities',
    '',
    'Total Liabilities',
    formatDollarsFromCents(result.totals.liabilities),
  ]);

  pushSection('Equity', result.equity);
  rows.push(['Equity', '', 'Total Equity', formatDollarsFromCents(result.totals.equityPlusCYE)]);

  rows.push([
    'Totals',
    '',
    'Total Liabilities and Equity',
    formatDollarsFromCents(result.totals.liabilities + result.totals.equityPlusCYE),
  ]);

  const csv = buildCsv(['Section', 'Code', 'Account', 'Amount'], rows);
  const filenameDate = asOfDate.toISOString().slice(0, 10);
  const filename = `balance-sheet-${filenameDate}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});
