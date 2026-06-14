import { READ_TEAM_ROLES, withApiTeamRole } from '@/lib/auth/api';
import { getTrialBalance } from '@/lib/accounting/reports/trial-balance';
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

function formatDollarsFromCents(value: number): string {
  return (value / 100).toFixed(2);
}

export const GET = withApiTeamRole(READ_TEAM_ROLES, async ({ team }, request) => {
  const url = new URL(request.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');

  const today = new Date();
  const startOfYear = new Date(today.getFullYear(), 0, 1);

  const fromDate = parseDateParam(fromParam, startOfYear);
  const toDate = parseDateParam(toParam, today);

  const rows = await getTrialBalance({
    orgId: team.id,
    fromDate,
    toDate,
  });

  const totals = rows.reduce(
    (acc, row) => ({
      beginDebit: acc.beginDebit + row.beginDebit,
      beginCredit: acc.beginCredit + row.beginCredit,
      changeDebit: acc.changeDebit + row.changeDebit,
      changeCredit: acc.changeCredit + row.changeCredit,
      endDebit: acc.endDebit + row.endDebit,
      endCredit: acc.endCredit + row.endCredit,
    }),
    {
      beginDebit: 0,
      beginCredit: 0,
      changeDebit: 0,
      changeCredit: 0,
      endDebit: 0,
      endCredit: 0,
    },
  );

  const csvRows = rows.map((row) => [
    row.code,
    row.name,
    formatDollarsFromCents(row.beginDebit),
    formatDollarsFromCents(row.beginCredit),
    formatDollarsFromCents(row.changeDebit),
    formatDollarsFromCents(row.changeCredit),
    formatDollarsFromCents(row.endDebit),
    formatDollarsFromCents(row.endCredit),
  ]);

  csvRows.push([
    '',
    'Totals',
    formatDollarsFromCents(totals.beginDebit),
    formatDollarsFromCents(totals.beginCredit),
    formatDollarsFromCents(totals.changeDebit),
    formatDollarsFromCents(totals.changeCredit),
    formatDollarsFromCents(totals.endDebit),
    formatDollarsFromCents(totals.endCredit),
  ]);

  const csv = buildCsv(
    [
      'Code',
      'Account',
      'Begin Debit',
      'Begin Credit',
      'Change Debit',
      'Change Credit',
      'End Debit',
      'End Credit',
    ],
    csvRows,
  );
  const filenameDate = toDate.toISOString().slice(0, 10);
  const filename = `trial-balance-${filenameDate}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});
