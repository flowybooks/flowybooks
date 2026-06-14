import { getTeamForUser } from '@/lib/db/queries';
import { getIncomeStatement } from '@/lib/accounting/reports/income-statement';
import {
  getCompareRange,
  normalizeCompareMode,
  type CompareMode,
} from '@/lib/accounting/reports/compare-period';
import { ReportActions } from '../report-actions';
import { IncomeStatementReportControls } from './report-controls';

type PageProps = {
  searchParams?: Promise<{
    from?: string;
    to?: string;
    instance?: string;
    compare?: string;
    period?: string;
  }>;
};

function parseDateParam(value: string | undefined): Date | null {
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

function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatCents(value: number): string {
  if (!value) return '—';
  return (value / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function getLastMonthRange(today: Date): { from: Date; to: Date } {
  const previousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return {
    from: new Date(previousMonth.getFullYear(), previousMonth.getMonth(), 1),
    to: new Date(previousMonth.getFullYear(), previousMonth.getMonth() + 1, 0),
  };
}

export default async function IncomeStatementPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const instanceId = params.instance ?? 'default';
  const compareMode: CompareMode = normalizeCompareMode(params.compare);

  const team = await getTeamForUser();

  if (!team) {
    return (
      <div className="p-6">
        <div className="p-4 border bg-muted/50 text-muted-foreground">
          Please create or select an organization to view reports.
        </div>
      </div>
    );
  }

  const { from: defaultFrom, to: defaultTo } = getLastMonthRange(new Date());
  const fromDate = parseDateParam(params.from) ?? defaultFrom;
  const toDate = parseDateParam(params.to) ?? defaultTo;

  const result = await getIncomeStatement({ team, fromDate, toDate });
  const compareRange = getCompareRange(compareMode, fromDate, toDate);
  const compareResult = compareRange
    ? await getIncomeStatement({
        team,
        fromDate: compareRange.from,
        toDate: compareRange.to,
      })
    : null;
  const showCompare = compareRange !== null && compareResult !== null;

  const compareByAccount = new Map(
    (compareResult?.accounts ?? []).map((row) => [row.accountId, row]),
  );

  const mergedAccounts = result.accounts.map((row) => {
    const compareRow = compareByAccount.get(row.accountId);
    return {
      ...row,
      comparePeriodAmount: compareRow?.periodAmount ?? 0,
      compareYtdAmount: compareRow?.ytdAmount ?? 0,
    };
  });

  const visibleAccounts = mergedAccounts.filter(
    (row) =>
      row.periodAmount !== 0 ||
      row.ytdAmount !== 0 ||
      row.comparePeriodAmount !== 0 ||
      row.compareYtdAmount !== 0,
  );

  const incomeAccounts = visibleAccounts.filter((row) => row.type === 'income');
  const expenseAccounts = visibleAccounts.filter((row) => row.type === 'expense');

  const exportParams = new URLSearchParams({
    from: formatDateInputValue(fromDate),
    to: formatDateInputValue(toDate),
  });
  const exportHref = `/api/reports/income-statement/export-csv?${exportParams.toString()}`;
  const rowGridClass = showCompare
    ? 'grid-cols-[80px_minmax(0,1fr)_120px_120px_120px_120px_120px_120px]'
    : 'grid-cols-[80px_minmax(0,1fr)_120px_120px]';
  const minWidthClass = showCompare ? 'min-w-[980px]' : '';

  // Calculate subtotals
  const periodIncome = incomeAccounts.reduce((sum, acc) => sum + acc.periodAmount, 0);
  const periodExpenses = Math.abs(expenseAccounts.reduce((sum, acc) => sum + acc.periodAmount, 0));
  const ytdIncome = incomeAccounts.reduce((sum, acc) => sum + acc.ytdAmount, 0);
  const ytdExpenses = Math.abs(expenseAccounts.reduce((sum, acc) => sum + acc.ytdAmount, 0));
  const comparePeriodIncome = incomeAccounts.reduce((sum, acc) => sum + acc.comparePeriodAmount, 0);
  const comparePeriodExpenses = Math.abs(
    expenseAccounts.reduce((sum, acc) => sum + acc.comparePeriodAmount, 0),
  );
  const compareYtdIncome = incomeAccounts.reduce((sum, acc) => sum + acc.compareYtdAmount, 0);
  const compareYtdExpenses = Math.abs(
    expenseAccounts.reduce((sum, acc) => sum + acc.compareYtdAmount, 0),
  );
  const compareTotals = compareResult?.totals ?? { periodNetIncome: 0, ytdNetIncome: 0 };
  const periodVariance = result.totals.periodNetIncome - compareTotals.periodNetIncome;
  const ytdVariance = result.totals.ytdNetIncome - compareTotals.ytdNetIncome;

  return (
    <div className="p-4 space-y-4" data-print-page data-report-page>
      <div className="rounded-md border bg-background shadow-sm">
        <div className="border-b bg-muted/20 px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                {team.name}
              </h1>
              <h2 className="text-xl font-semibold mt-1">Income Statement</h2>
              <p className="text-sm text-muted-foreground mt-1.5">
                For the Period {formatDisplayDate(fromDate)} to {formatDisplayDate(toDate)}
              </p>
              {showCompare && compareRange ? (
                <p className="text-xs text-muted-foreground">
                  Compare to {formatDisplayDate(compareRange.from)} to{' '}
                  {formatDisplayDate(compareRange.to)}
                </p>
              ) : null}
            </div>
            <ReportActions
              exportHref={exportHref}
              printTitle={`Income Statement - ${team.name} - ${formatDisplayDate(fromDate)} to ${formatDisplayDate(toDate)}`}
            />
          </div>
        </div>

        <div className="border-b bg-muted/10 px-6 py-3" data-report-controls>
          <IncomeStatementReportControls
            instanceId={instanceId}
            storageKey={`report-income-statement:${instanceId}`}
            initialFrom={formatDateInputValue(fromDate)}
            initialTo={formatDateInputValue(toDate)}
            initialCompare={compareMode}
            fiscalYearEndMonth={team.fiscalYearEndMonth}
            initialPeriodParam={params.period ?? null}
          />
        </div>

        {/* Income Statement Content */}
        <div className="px-6 py-5 text-sm">
          {visibleAccounts.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No income or expense activity for this period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className={`space-y-6 ${minWidthClass}`}>
                {/* Column Headers */}
                <div
                  className={`grid ${rowGridClass} items-center text-xs text-muted-foreground uppercase tracking-wide border-b border-muted pb-1`}
                >
                  <span />
                  <span />
                  <span className="text-right">Period</span>
                  {showCompare ? (
                    <>
                      <span className="text-right">Compare</span>
                      <span className="text-right">Variance</span>
                    </>
                  ) : null}
                  <span className="text-right">YTD</span>
                  {showCompare ? (
                    <>
                      <span className="text-right">Compare</span>
                      <span className="text-right">Variance</span>
                    </>
                  ) : null}
                </div>

                {/* INCOME */}
                <section>
                  <h3 className="font-medium uppercase tracking-wide border-b border-foreground pb-1 mb-2">
                    Income
                  </h3>
                  <div className="space-y-1">
                    {incomeAccounts.length === 0 ? (
                      <div className="text-muted-foreground py-2 pl-4">No income.</div>
                    ) : (
                      incomeAccounts.map((row) => (
                        <div
                          key={row.accountId}
                          className={`grid items-center gap-4 pl-4 ${rowGridClass}`}
                        >
                          <span className="text-muted-foreground">{row.code ?? ''}</span>
                          <span className="min-w-0">
                            <a
                              className="link-on-hover block truncate"
                              href={`/dashboard/reports/general-ledger?accountIds=${row.accountId}&from=${formatDateInputValue(fromDate)}&to=${formatDateInputValue(toDate)}`}
                              title={row.name}
                            >
                              {row.name}
                            </a>
                          </span>
                          <span className="text-right tabular-nums">
                            {formatCents(row.periodAmount)}
                          </span>
                          {showCompare ? (
                            <>
                              <span className="text-right tabular-nums">
                                {formatCents(row.comparePeriodAmount)}
                              </span>
                              <span className="text-right tabular-nums">
                                {formatCents(row.periodAmount - row.comparePeriodAmount)}
                              </span>
                            </>
                          ) : null}
                          <span className="text-right tabular-nums">
                            {formatCents(row.ytdAmount)}
                          </span>
                          {showCompare ? (
                            <>
                              <span className="text-right tabular-nums">
                                {formatCents(row.compareYtdAmount)}
                              </span>
                              <span className="text-right tabular-nums">
                                {formatCents(row.ytdAmount - row.compareYtdAmount)}
                              </span>
                            </>
                          ) : null}
                        </div>
                      ))
                    )}
                    <div
                      className={`grid items-center gap-4 pl-8 pt-2 border-t border-muted font-medium ${rowGridClass}`}
                    >
                      <span />
                      <span>Total Income</span>
                      <span className="text-right tabular-nums">{formatCents(periodIncome)}</span>
                      {showCompare ? (
                        <>
                          <span className="text-right tabular-nums">
                            {formatCents(comparePeriodIncome)}
                          </span>
                          <span className="text-right tabular-nums">
                            {formatCents(periodIncome - comparePeriodIncome)}
                          </span>
                        </>
                      ) : null}
                      <span className="text-right tabular-nums">{formatCents(ytdIncome)}</span>
                      {showCompare ? (
                        <>
                          <span className="text-right tabular-nums">
                            {formatCents(compareYtdIncome)}
                          </span>
                          <span className="text-right tabular-nums">
                            {formatCents(ytdIncome - compareYtdIncome)}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </section>

                {/* EXPENSES */}
                <section>
                  <h3 className="font-medium uppercase tracking-wide border-b border-foreground pb-1 mb-2">
                    Expenses
                  </h3>
                  <div className="space-y-1">
                    {expenseAccounts.length === 0 ? (
                      <div className="text-muted-foreground py-2 pl-4">No expenses.</div>
                    ) : (
                      expenseAccounts.map((row) => {
                        const periodValue = Math.abs(row.periodAmount);
                        const comparePeriodValue = Math.abs(row.comparePeriodAmount);
                        const ytdValue = Math.abs(row.ytdAmount);
                        const compareYtdValue = Math.abs(row.compareYtdAmount);
                        return (
                          <div
                            key={row.accountId}
                            className={`grid items-center gap-4 pl-4 ${rowGridClass}`}
                          >
                            <span className="text-muted-foreground">{row.code ?? ''}</span>
                            <span className="min-w-0">
                              <a
                                className="link-on-hover block truncate"
                                href={`/dashboard/reports/general-ledger?accountIds=${row.accountId}&from=${formatDateInputValue(fromDate)}&to=${formatDateInputValue(toDate)}`}
                                title={row.name}
                              >
                                {row.name}
                              </a>
                            </span>
                            <span className="text-right tabular-nums">
                              {formatCents(periodValue)}
                            </span>
                            {showCompare ? (
                              <>
                                <span className="text-right tabular-nums">
                                  {formatCents(comparePeriodValue)}
                                </span>
                                <span className="text-right tabular-nums">
                                  {formatCents(periodValue - comparePeriodValue)}
                                </span>
                              </>
                            ) : null}
                            <span className="text-right tabular-nums">{formatCents(ytdValue)}</span>
                            {showCompare ? (
                              <>
                                <span className="text-right tabular-nums">
                                  {formatCents(compareYtdValue)}
                                </span>
                                <span className="text-right tabular-nums">
                                  {formatCents(ytdValue - compareYtdValue)}
                                </span>
                              </>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                    <div
                      className={`grid items-center gap-4 pl-8 pt-2 border-t border-muted font-medium ${rowGridClass}`}
                    >
                      <span />
                      <span>Total Expenses</span>
                      <span className="text-right tabular-nums">{formatCents(periodExpenses)}</span>
                      {showCompare ? (
                        <>
                          <span className="text-right tabular-nums">
                            {formatCents(comparePeriodExpenses)}
                          </span>
                          <span className="text-right tabular-nums">
                            {formatCents(periodExpenses - comparePeriodExpenses)}
                          </span>
                        </>
                      ) : null}
                      <span className="text-right tabular-nums">{formatCents(ytdExpenses)}</span>
                      {showCompare ? (
                        <>
                          <span className="text-right tabular-nums">
                            {formatCents(compareYtdExpenses)}
                          </span>
                          <span className="text-right tabular-nums">
                            {formatCents(ytdExpenses - compareYtdExpenses)}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </section>

                {/* NET INCOME */}
                <section className="border-t-2 border-foreground pt-2">
                  <div className={`grid items-center gap-4 font-medium pl-8 ${rowGridClass}`}>
                    <span />
                    <span>Net Income</span>
                    <span className="text-right tabular-nums">
                      {formatCents(result.totals.periodNetIncome)}
                    </span>
                    {showCompare ? (
                      <>
                        <span className="text-right tabular-nums">
                          {formatCents(compareTotals.periodNetIncome)}
                        </span>
                        <span className="text-right tabular-nums">
                          {formatCents(periodVariance)}
                        </span>
                      </>
                    ) : null}
                    <span className="text-right tabular-nums">
                      {formatCents(result.totals.ytdNetIncome)}
                    </span>
                    {showCompare ? (
                      <>
                        <span className="text-right tabular-nums">
                          {formatCents(compareTotals.ytdNetIncome)}
                        </span>
                        <span className="text-right tabular-nums">{formatCents(ytdVariance)}</span>
                      </>
                    ) : null}
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
