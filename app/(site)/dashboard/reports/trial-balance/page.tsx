import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getTeamForUser } from '@/lib/db/queries';
import { getTrialBalance } from '@/lib/accounting/reports/trial-balance';
import {
  getCompareRange,
  normalizeCompareMode,
  type CompareMode,
} from '@/lib/accounting/reports/compare-period';
import { ReportActions } from '../report-actions';
import { TrialBalanceReportControls } from './report-controls';

type PageProps = {
  searchParams?: Promise<{
    from?: string;
    to?: string;
    instance?: string;
    compare?: string;
    period?: string;
  }>;
};

function parseDateParam(value: string | undefined, fallback: Date): Date {
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

function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatCents(value: number): string {
  if (!value) return '';
  return (value / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

export default async function TrialBalancePage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const instanceId = params.instance ?? 'default';
  const compareMode: CompareMode = normalizeCompareMode(params.compare);
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
  const startOfYear = new Date(today.getFullYear(), 0, 1);

  const fromDate = parseDateParam(params.from, startOfYear);
  const toDate = parseDateParam(params.to, today);

  const rows = await getTrialBalance({
    orgId: team.id,
    fromDate,
    toDate,
  });
  const compareRange = getCompareRange(compareMode, fromDate, toDate);
  const compareRows = compareRange
    ? await getTrialBalance({
        orgId: team.id,
        fromDate: compareRange.from,
        toDate: compareRange.to,
      })
    : [];
  const showCompare = compareRange !== null;
  const compareByAccount = new Map(compareRows.map((row) => [row.accountId, row]));

  const exportParams = new URLSearchParams({
    from: formatDateInputValue(fromDate),
    to: formatDateInputValue(toDate),
  });
  const exportHref = `/api/reports/trial-balance/export-csv?${exportParams.toString()}`;

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
  const compareTotals = compareRows.reduce(
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
  const varianceNet =
    totals.endDebit - totals.endCredit - (compareTotals.endDebit - compareTotals.endCredit);

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4" data-print-page data-report-page>
      <div className="rounded-md border bg-background shadow-sm">
        <div className="border-b bg-muted/20 px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                {team.name}
              </h1>
              <h2 className="text-xl font-semibold mt-1">Trial Balance</h2>
              <p className="text-sm text-muted-foreground mt-1.5">
                Period from {formatDateInputValue(fromDate)} to {formatDateInputValue(toDate)}.
              </p>
              {showCompare && compareRange ? (
                <p className="text-xs text-muted-foreground">
                  Compare to {formatDateInputValue(compareRange.from)} to{' '}
                  {formatDateInputValue(compareRange.to)}.
                </p>
              ) : null}
            </div>
            <ReportActions
              exportHref={exportHref}
              printTitle={`Trial Balance - ${team.name} - ${formatDateInputValue(fromDate)} to ${formatDateInputValue(toDate)}`}
            />
          </div>
        </div>

        <div className="border-b bg-muted/10 px-6 py-3" data-report-controls>
          <TrialBalanceReportControls
            instanceId={instanceId}
            storageKey={`report-trial-balance:${instanceId}`}
            initialFrom={formatDateInputValue(fromDate)}
            initialTo={formatDateInputValue(toDate)}
            initialCompare={compareMode}
            fiscalYearEndMonth={team.fiscalYearEndMonth}
            initialPeriodParam={params.period ?? null}
          />
        </div>

        <div className="px-6 py-5">
          <div className="border rounded-md overflow-x-auto">
            <Table className={showCompare ? 'min-w-[1200px]' : undefined}>
              <TableHeader>
                {showCompare ? (
                  <>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead colSpan={2} />
                      <TableHead colSpan={6} className="text-center text-xs uppercase">
                        Current
                      </TableHead>
                      <TableHead colSpan={6} className="text-center text-xs uppercase">
                        Compare
                      </TableHead>
                      <TableHead className="text-right text-xs uppercase">Variance</TableHead>
                    </TableRow>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>Code</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Begin Debit</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Begin Credit</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Change Debit</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Change Credit</TableHead>
                      <TableHead className="text-right whitespace-nowrap">End Debit</TableHead>
                      <TableHead className="text-right whitespace-nowrap">End Credit</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Begin Debit</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Begin Credit</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Change Debit</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Change Credit</TableHead>
                      <TableHead className="text-right whitespace-nowrap">End Debit</TableHead>
                      <TableHead className="text-right whitespace-nowrap">End Credit</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Net</TableHead>
                    </TableRow>
                  </>
                ) : (
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Code</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Begin Debit</TableHead>
                    <TableHead className="text-right">Begin Credit</TableHead>
                    <TableHead className="text-right">Change Debit</TableHead>
                    <TableHead className="text-right">Change Credit</TableHead>
                    <TableHead className="text-right">End Debit</TableHead>
                    <TableHead className="text-right">End Credit</TableHead>
                  </TableRow>
                )}
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={showCompare ? 15 : 8}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No posted journal entries found for this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {rows.map((row) => {
                      const compare = compareByAccount.get(row.accountId) ?? {
                        beginDebit: 0,
                        beginCredit: 0,
                        changeDebit: 0,
                        changeCredit: 0,
                        endDebit: 0,
                        endCredit: 0,
                      };
                      const rowVariance =
                        row.endDebit - row.endCredit - (compare.endDebit - compare.endCredit);
                      return (
                        <TableRow key={row.accountId}>
                          <TableCell className="text-xs text-muted-foreground">
                            {row.code}
                          </TableCell>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell className="text-right">
                            {formatCents(row.beginDebit)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCents(row.beginCredit)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCents(row.changeDebit)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCents(row.changeCredit)}
                          </TableCell>
                          <TableCell className="text-right">{formatCents(row.endDebit)}</TableCell>
                          <TableCell className="text-right">{formatCents(row.endCredit)}</TableCell>
                          {showCompare ? (
                            <>
                              <TableCell className="text-right">
                                {formatCents(compare.beginDebit)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCents(compare.beginCredit)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCents(compare.changeDebit)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCents(compare.changeCredit)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCents(compare.endDebit)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCents(compare.endCredit)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCents(rowVariance)}
                              </TableCell>
                            </>
                          ) : null}
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={2} className="text-right font-semibold">
                        Totals
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCents(totals.beginDebit)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCents(totals.beginCredit)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCents(totals.changeDebit)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCents(totals.changeCredit)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCents(totals.endDebit)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCents(totals.endCredit)}
                      </TableCell>
                      {showCompare ? (
                        <>
                          <TableCell className="text-right font-semibold">
                            {formatCents(compareTotals.beginDebit)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCents(compareTotals.beginCredit)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCents(compareTotals.changeDebit)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCents(compareTotals.changeCredit)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCents(compareTotals.endDebit)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCents(compareTotals.endCredit)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCents(varianceNet)}
                          </TableCell>
                        </>
                      ) : null}
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
