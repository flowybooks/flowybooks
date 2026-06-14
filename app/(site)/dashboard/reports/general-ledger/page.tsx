import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getAccountsForTeam, getTeamForUser } from '@/lib/db/queries';
import { getGeneralLedger } from '@/lib/accounting/reports/general-ledger';
import { parseIsoDateParam, parseIsoDateParamOrNull } from '@/lib/utils/iso-date';
import { formatStoredAccountingDate } from '@/lib/utils/accounting-date';
import { ReportActions } from '../report-actions';
import { GeneralLedgerReportControls } from './report-controls';

type PageProps = {
  searchParams?: Promise<{
    from?: string;
    to?: string;
    accountIds?: string;
    accountId?: string;
    accountCode?: string;
    asOf?: string;
    instance?: string;
    period?: string;
  }>;
};

function getFiscalYearStart(fiscalYearEndMonth: number | null | undefined, asOfDate: Date): Date {
  const endMonth = fiscalYearEndMonth ?? 12; // 1-12
  const asOfYear = asOfDate.getFullYear();
  const asOfDay = new Date(asOfYear, asOfDate.getMonth(), asOfDate.getDate());
  const candidateEnd = new Date(asOfYear, endMonth, 0);
  const endYear = asOfDay <= candidateEnd ? asOfYear : asOfYear + 1;

  return endMonth === 12 ? new Date(endYear, 0, 1) : new Date(endYear - 1, endMonth, 1);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeAccountIdsParam(value: string | undefined): string[] {
  if (!value) return [];
  const ids = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .filter((part) => UUID_RE.test(part));
  return Array.from(new Set(ids)).slice(0, 200);
}

function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateDisplay(date: Date): string {
  return formatStoredAccountingDate(date);
}

function formatCents(value: number): string {
  if (!value) return '';
  return (value / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

export default async function GeneralLedgerPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const instanceId = params.instance ?? 'default';
  const team = await getTeamForUser();

  if (!team) {
    return (
      <div className="p-6">
        <div className="p-4 border rounded-md bg-muted/50 text-muted-foreground">
          Please create or select an organization to view reports.
        </div>
      </div>
    );
  }

  const today = new Date();

  const accounts = await getAccountsForTeam(team.id);
  const accountByCode = new Map(accounts.map((account) => [account.code, account]));
  const accountIdSet = new Set(accounts.map((account) => account.id));

  const asOfDate = parseIsoDateParamOrNull(params.asOf);
  const toDate = parseIsoDateParam(params.to, asOfDate ?? today);

  const fromFallback = asOfDate
    ? getFiscalYearStart(team.fiscalYearEndMonth, asOfDate)
    : new Date((asOfDate ?? today).getFullYear(), 0, 1);
  const fromDate = parseIsoDateParam(params.from, fromFallback);

  const accountIdsParam = normalizeAccountIdsParam(params.accountIds);
  let selectedAccountIds = accountIdsParam;

  if (selectedAccountIds.length === 0 && params.accountId && UUID_RE.test(params.accountId)) {
    selectedAccountIds = [params.accountId];
  }

  if (selectedAccountIds.length === 0 && typeof params.accountCode === 'string') {
    const account = accountByCode.get(params.accountCode.trim());
    if (account) {
      selectedAccountIds = [account.id];
    }
  }

  selectedAccountIds = selectedAccountIds.filter((id) => accountIdSet.has(id));
  const accountIds = selectedAccountIds.length > 0 ? selectedAccountIds : null;

  const lines = await getGeneralLedger({
    orgId: team.id,
    fromDate,
    toDate,
    accountIds: accountIds ?? undefined,
    accountCode: accountIds ? undefined : (params.accountCode ?? undefined),
  });

  const exportParams = new URLSearchParams({
    from: formatDateInputValue(fromDate),
    to: formatDateInputValue(toDate),
  });

  if (accountIds && accountIds.length > 0) {
    exportParams.set('accountIds', accountIds.join(','));
  }

  if (asOfDate) {
    exportParams.set('asOf', formatDateInputValue(asOfDate));
  }

  const exportHref = `/api/reports/general-ledger/export-csv?${exportParams.toString()}`;

  const totals = lines.reduce(
    (acc, line) => ({
      debit: acc.debit + line.debit,
      credit: acc.credit + line.credit,
    }),
    { debit: 0, credit: 0 },
  );

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4" data-print-page data-report-page>
      <div className="rounded-md border bg-background shadow-sm">
        <div className="border-b bg-muted/20 px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                {team.name}
              </h1>
              <h2 className="text-xl font-semibold mt-1">General Ledger</h2>
              <p className="text-sm text-muted-foreground mt-1.5">
                Posted journal lines from {formatDateInputValue(fromDate)} to{' '}
                {formatDateInputValue(toDate)}.
              </p>
            </div>
            <ReportActions
              exportHref={exportHref}
              printTitle={`General Ledger - ${team.name} - ${formatDateInputValue(fromDate)} to ${formatDateInputValue(toDate)}`}
            />
          </div>
        </div>

        <div className="border-b bg-muted/10 px-6 py-3" data-report-controls>
          <GeneralLedgerReportControls
            instanceId={instanceId}
            storageKey={`report-general-ledger:${instanceId}`}
            initialFrom={formatDateInputValue(fromDate)}
            initialTo={formatDateInputValue(toDate)}
            fiscalYearEndMonth={team.fiscalYearEndMonth}
            initialPeriodParam={params.period ?? null}
            accounts={accounts.map((account) => ({
              id: account.id,
              code: account.code,
              name: account.name,
              isActive: account.isActive,
            }))}
            initialAccountIds={accountIds ?? []}
            asOf={asOfDate ? formatDateInputValue(asOfDate) : null}
          />
        </div>

        <div className="px-6 py-5">
          <div className="border rounded-md overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="whitespace-nowrap">Date</TableHead>
                  <TableHead className="whitespace-nowrap">Journal</TableHead>
                  <TableHead className="whitespace-nowrap">Account</TableHead>
                  <TableHead>Narration</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Debit</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No posted journal lines found for this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDateDisplay(line.glDate)}
                        </TableCell>
                        <TableCell className="text-sm">
                          <a
                            href={`/dashboard/journal/${line.batchId}?focusLine=${line.id}`}
                            className="font-medium text-foreground link-on-hover"
                          >
                            {line.batchDescription}
                          </a>
                          <div className="text-xs text-muted-foreground" data-report-subline>
                            Journal date: {formatDateDisplay(line.batchDate)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{line.accountName}</div>
                          <div className="text-xs text-muted-foreground">{line.accountCode}</div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {line.narration || '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <a
                            className="link-on-hover"
                            href={`/dashboard/journal/${line.batchId}?focusLine=${line.id}`}
                          >
                            {formatCents(line.debit)}
                          </a>
                        </TableCell>
                        <TableCell className="text-right">
                          <a
                            className="link-on-hover"
                            href={`/dashboard/journal/${line.batchId}?focusLine=${line.id}`}
                          >
                            {formatCents(line.credit)}
                          </a>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={4} className="text-right font-semibold">
                        Totals
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCents(totals.debit)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCents(totals.credit)}
                      </TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
