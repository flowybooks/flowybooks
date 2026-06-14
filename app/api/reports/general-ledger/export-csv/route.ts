import { and, eq, inArray } from 'drizzle-orm';
import { READ_TEAM_ROLES, withApiTeamRole } from '@/lib/auth/api';
import { getGeneralLedger } from '@/lib/accounting/reports/general-ledger';
import { db } from '@/lib/db/drizzle';
import { accounts } from '@/lib/db/schema';
import { buildCsv } from '@/lib/utils/csv';
import { parseIsoDateParam, parseIsoDateParamOrNull } from '@/lib/utils/iso-date';

function getFiscalYearStart(fiscalYearEndMonth: number | null | undefined, asOfDate: Date): Date {
  const endMonth = fiscalYearEndMonth ?? 12; // 1-12
  const asOfYear = asOfDate.getFullYear();
  const asOfDay = new Date(asOfYear, asOfDate.getMonth(), asOfDate.getDate());
  const candidateEnd = new Date(asOfYear, endMonth, 0);
  const endYear = asOfDay <= candidateEnd ? asOfYear : asOfYear + 1;

  return endMonth === 12 ? new Date(endYear, 0, 1) : new Date(endYear - 1, endMonth, 1);
}

function formatDollarsFromCents(value: number): string {
  return (value / 100).toFixed(2);
}

export const GET = withApiTeamRole(READ_TEAM_ROLES, async ({ team }, request) => {
  const url = new URL(request.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  const accountIdsParam = url.searchParams.get('accountIds');
  const accountIdParam = url.searchParams.get('accountId');
  const rawAccountId = accountIdParam ? accountIdParam : undefined;
  const accountCodeParam = url.searchParams.get('accountCode');
  const accountCode = accountCodeParam ? accountCodeParam : undefined;
  const asOfParam = url.searchParams.get('asOf');

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (rawAccountId && !UUID_RE.test(rawAccountId)) {
    return new Response(JSON.stringify({ error: 'Invalid account id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const accountId = rawAccountId;

  const normalizedAccountIds = accountIdsParam
    ? Array.from(
        new Set(
          accountIdsParam
            .split(',')
            .map((part) => part.trim())
            .filter((part) => part.length > 0)
            .filter((part) => UUID_RE.test(part)),
        ),
      ).slice(0, 200)
    : [];

  if (normalizedAccountIds.length > 0) {
    const rows = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.orgId, team.id), inArray(accounts.id, normalizedAccountIds)));

    if (rows.length !== normalizedAccountIds.length) {
      return new Response(JSON.stringify({ error: 'Account not found for current user' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } else if (accountId) {
    const [account] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.orgId, team.id), eq(accounts.id, accountId)))
      .limit(1);

    if (!account) {
      return new Response(JSON.stringify({ error: 'Account not found for current user' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const today = new Date();
  const asOfDate = parseIsoDateParamOrNull(asOfParam);
  const toDate = parseIsoDateParam(toParam, asOfDate ?? today);
  const fromFallback = asOfDate
    ? getFiscalYearStart(team.fiscalYearEndMonth, asOfDate)
    : new Date((asOfDate ?? today).getFullYear(), 0, 1);
  const fromDate = parseIsoDateParam(fromParam, fromFallback);

  const accountIds =
    normalizedAccountIds.length > 0 ? normalizedAccountIds : accountId ? [accountId] : undefined;

  const lines = await getGeneralLedger({
    orgId: team.id,
    fromDate,
    toDate,
    accountIds,
    accountCode: accountIds && accountIds.length > 0 ? undefined : accountCode,
  });

  const totals = lines.reduce(
    (acc, line) => ({
      debit: acc.debit + line.debit,
      credit: acc.credit + line.credit,
    }),
    { debit: 0, credit: 0 },
  );

  const csvRows = lines.map((line) => [
    line.glDate,
    line.batchDate,
    line.batchDescription,
    line.narration ?? '',
    line.accountCode,
    line.accountName,
    formatDollarsFromCents(line.debit),
    formatDollarsFromCents(line.credit),
  ]);

  csvRows.push([
    '',
    '',
    'Totals',
    '',
    '',
    '',
    formatDollarsFromCents(totals.debit),
    formatDollarsFromCents(totals.credit),
  ]);

  const csv = buildCsv(
    [
      'GL Date',
      'Journal Date',
      'Journal',
      'Narration',
      'Account Code',
      'Account',
      'Debit',
      'Credit',
    ],
    csvRows,
  );
  const filenameDate = toDate.toISOString().slice(0, 10);
  const filename = `general-ledger-${filenameDate}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});
