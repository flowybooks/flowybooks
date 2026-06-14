import { READ_TEAM_ROLES, withApiTeamRole } from '@/lib/auth/api';
import { getBalanceSheet } from '@/lib/accounting/reports/balance-sheet';

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
  const asOfParam = url.searchParams.get('asOf');
  const parsedAsOf = parseDateParam(asOfParam);
  if (asOfParam && !parsedAsOf) {
    return Response.json({ error: 'Invalid asOf date' }, { status: 400 });
  }
  const asOfDate = parsedAsOf ?? new Date();

  const result = await getBalanceSheet({ team, asOfDate });

  return Response.json({
    assets: result.assets,
    liabilities: result.liabilities,
    equity: result.equity,
    totals: result.totals,
  });
});
