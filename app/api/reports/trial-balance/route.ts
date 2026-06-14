import { READ_TEAM_ROLES, withApiTeamRole } from '@/lib/auth/api';
import { getTrialBalance, getTrialBalanceAsOf } from '@/lib/accounting/reports/trial-balance';

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

export const GET = withApiTeamRole(READ_TEAM_ROLES, async ({ team }, request) => {
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode');
  const asOfParam = url.searchParams.get('asOf');
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');

  if (mode === 'period') {
    const parsedFrom = parseDateParam(fromParam);
    if (fromParam && !parsedFrom) {
      return Response.json({ error: 'Invalid from date' }, { status: 400 });
    }
    const parsedTo = parseDateParam(toParam);
    if (toParam && !parsedTo) {
      return Response.json({ error: 'Invalid to date' }, { status: 400 });
    }

    const fromDate = parsedFrom ?? new Date(team.createdAt);
    const toDate = parsedTo ?? new Date();

    if (fromDate > toDate) {
      return Response.json({ error: 'from date must be on or before to date' }, { status: 400 });
    }

    const rows = await getTrialBalance({
      orgId: team.id,
      fromDate,
      toDate,
    });

    return Response.json({
      mode: 'period',
      accounts: rows,
      currentYearEarnings: null,
      totals: null,
    });
  }

  const parsedAsOf = parseDateParam(asOfParam);
  if (asOfParam && !parsedAsOf) {
    return Response.json({ error: 'Invalid asOf date' }, { status: 400 });
  }
  const asOfDate = parsedAsOf ?? new Date();

  const tb = await getTrialBalanceAsOf({ team, asOfDate });

  return Response.json({
    mode: 'as-of',
    accounts: tb.accounts.map((row) => ({
      accountId: row.accountId,
      name: row.name,
      code: row.code,
      debit: row.debit,
      credit: row.credit,
      net: row.net,
    })),
    currentYearEarnings: tb.currentYearEarnings,
    totals: tb.totals,
  });
});
