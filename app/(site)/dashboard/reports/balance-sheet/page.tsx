import { getTeamForUser } from '@/lib/db/queries';
import {
  getBalanceSheet,
  type BalanceSheetSectionRow,
} from '@/lib/accounting/reports/balance-sheet';
import {
  getCompareAsOf,
  normalizeCompareMode,
  type CompareMode,
} from '@/lib/accounting/reports/compare-period';
import { ReportActions } from '../report-actions';
import { BalanceSheetReportControls } from './report-controls';

type PageProps = {
  searchParams?: Promise<{
    asOf?: string;
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

function getDefaultAsOfDate(): Date {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth() + 1, 0);
}

type BalanceSheetRowWithCompare = {
  compareAmount: number;
} & BalanceSheetSectionRow;

function getBalanceSheetRowKey(row: BalanceSheetSectionRow): string {
  return row.accountId ?? `virtual:${row.name}`;
}

function mergeBalanceSheetSection(
  current: BalanceSheetSectionRow[],
  compare?: BalanceSheetSectionRow[],
): BalanceSheetRowWithCompare[] {
  const merged = new Map<string, BalanceSheetRowWithCompare>();

  for (const row of current) {
    merged.set(getBalanceSheetRowKey(row), {
      ...row,
      compareAmount: 0,
    });
  }

  for (const row of compare ?? []) {
    const key = getBalanceSheetRowKey(row);
    const existing = merged.get(key);
    if (existing) {
      existing.compareAmount = row.amount;
    } else {
      merged.set(key, {
        ...row,
        amount: 0,
        compareAmount: row.amount,
      });
    }
  }

  return Array.from(merged.values());
}

function filterBalanceSheetRows(
  rows: BalanceSheetRowWithCompare[],
  showCompare: boolean,
): BalanceSheetRowWithCompare[] {
  if (!showCompare) {
    return rows.filter((row) => row.amount !== 0);
  }
  return rows.filter((row) => row.amount !== 0 || row.compareAmount !== 0);
}

export default async function BalanceSheetPage({ searchParams }: PageProps) {
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

  const defaultAsOf = getDefaultAsOfDate();
  const asOfDate = parseDateParam(params.asOf, defaultAsOf);
  const compareAsOf = getCompareAsOf(compareMode, asOfDate);

  const result = await getBalanceSheet({ team, asOfDate });
  const compareResult = compareAsOf ? await getBalanceSheet({ team, asOfDate: compareAsOf }) : null;
  const showCompare = compareMode !== 'none' && compareResult !== null;

  const assets = filterBalanceSheetRows(
    mergeBalanceSheetSection(result.assets, compareResult?.assets),
    showCompare,
  );
  const liabilities = filterBalanceSheetRows(
    mergeBalanceSheetSection(result.liabilities, compareResult?.liabilities),
    showCompare,
  );
  const equity = filterBalanceSheetRows(
    mergeBalanceSheetSection(result.equity, compareResult?.equity),
    showCompare,
  );
  const compareTotals = compareResult?.totals ?? null;
  const totalLiabilitiesAndEquity = result.totals.liabilities + result.totals.equityPlusCYE;
  const compareTotalLiabilitiesAndEquity = compareTotals
    ? compareTotals.liabilities + compareTotals.equityPlusCYE
    : 0;
  const exportParams = new URLSearchParams({
    asOf: formatDateInputValue(asOfDate),
  });
  const exportHref = `/api/reports/balance-sheet/export-csv?${exportParams.toString()}`;
  const rowGridClass = showCompare
    ? 'grid-cols-[80px_minmax(0,1fr)_120px_120px_120px]'
    : 'grid-cols-[80px_minmax(0,1fr)_120px]';

  return (
    <div className="p-4 space-y-4" data-print-page data-report-page>
      <div className="rounded-md border bg-background shadow-sm">
        <div className="border-b bg-muted/20 px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                {team.name}
              </h1>
              <h2 className="text-xl font-semibold mt-1">Balance Sheet</h2>
              <p className="text-sm text-muted-foreground mt-1.5">
                As of {formatDisplayDate(asOfDate)}
              </p>
              {showCompare && compareAsOf ? (
                <p className="text-xs text-muted-foreground">
                  Compare to {formatDisplayDate(compareAsOf)}
                </p>
              ) : null}
            </div>
            <ReportActions
              exportHref={exportHref}
              printTitle={`Balance Sheet - ${team.name} - ${formatDisplayDate(asOfDate)}`}
            />
          </div>
        </div>

        <div className="border-b bg-muted/10 px-6 py-3" data-report-controls>
          <BalanceSheetReportControls
            instanceId={instanceId}
            storageKey={`report-balance-sheet:${instanceId}`}
            initialAsOf={formatDateInputValue(asOfDate)}
            initialCompare={compareMode}
            fiscalYearEndMonth={team.fiscalYearEndMonth}
            initialPeriodParam={params.period ?? null}
          />
        </div>

        {/* Balance Sheet Content */}
        <div className="px-6 py-5 text-sm">
          <div className="overflow-x-auto">
            <div className={`space-y-6 ${showCompare ? 'min-w-[720px]' : ''}`}>
              {showCompare ? (
                <div
                  className={`grid ${rowGridClass} text-xs uppercase tracking-wide text-muted-foreground`}
                >
                  <span />
                  <span />
                  <span className="text-right">Current</span>
                  <span className="text-right">Compare</span>
                  <span className="text-right">Variance</span>
                </div>
              ) : null}

              {/* ASSETS */}
              <section>
                <h3 className="font-medium uppercase tracking-wide border-b border-foreground pb-1 mb-2">
                  Assets
                </h3>
                <div className="space-y-1">
                  {assets.length === 0 ? (
                    <div className="text-muted-foreground py-2">No asset balances.</div>
                  ) : (
                    <>
                      {assets.map((row) => (
                        <div
                          key={row.accountId ?? row.name}
                          className={`grid items-center gap-4 pl-4 ${rowGridClass}`}
                        >
                          <span className="text-muted-foreground">{row.code ?? ''}</span>
                          <span className="min-w-0">
                            {row.accountId ? (
                              <a
                                className="link-on-hover block truncate"
                                href={`/dashboard/reports/general-ledger?accountIds=${row.accountId}&asOf=${formatDateInputValue(asOfDate)}`}
                                title={row.name}
                              >
                                {row.name}
                              </a>
                            ) : (
                              <span className="block truncate" title={row.name}>
                                {row.name}
                              </span>
                            )}
                          </span>
                          <span className="text-right tabular-nums">{formatCents(row.amount)}</span>
                          {showCompare ? (
                            <>
                              <span className="text-right tabular-nums">
                                {formatCents(row.compareAmount)}
                              </span>
                              <span className="text-right tabular-nums">
                                {formatCents(row.amount - row.compareAmount)}
                              </span>
                            </>
                          ) : null}
                        </div>
                      ))}
                      <div
                        className={`grid items-center gap-4 pl-8 pt-2 border-t border-muted font-medium ${rowGridClass}`}
                      >
                        <span />
                        <span>Total Assets</span>
                        <span className="text-right tabular-nums">
                          {formatCents(result.totals.assets)}
                        </span>
                        {showCompare ? (
                          <>
                            <span className="text-right tabular-nums">
                              {formatCents(compareTotals?.assets ?? 0)}
                            </span>
                            <span className="text-right tabular-nums">
                              {formatCents(result.totals.assets - (compareTotals?.assets ?? 0))}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
              </section>

              {/* LIABILITIES */}
              <section>
                <h3 className="font-medium uppercase tracking-wide border-b border-foreground pb-1 mb-2">
                  Liabilities
                </h3>
                <div className="space-y-1">
                  {liabilities.length === 0 ? (
                    <div className="text-muted-foreground py-2">No liability balances.</div>
                  ) : (
                    <>
                      {liabilities.map((row) => (
                        <div
                          key={row.accountId ?? row.name}
                          className={`grid items-center gap-4 pl-4 ${rowGridClass}`}
                        >
                          <span className="text-muted-foreground">{row.code ?? ''}</span>
                          <span className="min-w-0">
                            {row.accountId ? (
                              <a
                                className="link-on-hover block truncate"
                                href={`/dashboard/reports/general-ledger?accountIds=${row.accountId}&asOf=${formatDateInputValue(asOfDate)}`}
                                title={row.name}
                              >
                                {row.name}
                              </a>
                            ) : (
                              <span className="block truncate" title={row.name}>
                                {row.name}
                              </span>
                            )}
                          </span>
                          <span className="text-right tabular-nums">{formatCents(row.amount)}</span>
                          {showCompare ? (
                            <>
                              <span className="text-right tabular-nums">
                                {formatCents(row.compareAmount)}
                              </span>
                              <span className="text-right tabular-nums">
                                {formatCents(row.amount - row.compareAmount)}
                              </span>
                            </>
                          ) : null}
                        </div>
                      ))}
                      <div
                        className={`grid items-center gap-4 pl-8 pt-2 border-t border-muted font-medium ${rowGridClass}`}
                      >
                        <span />
                        <span>Total Liabilities</span>
                        <span className="text-right tabular-nums">
                          {formatCents(result.totals.liabilities)}
                        </span>
                        {showCompare ? (
                          <>
                            <span className="text-right tabular-nums">
                              {formatCents(compareTotals?.liabilities ?? 0)}
                            </span>
                            <span className="text-right tabular-nums">
                              {formatCents(
                                result.totals.liabilities - (compareTotals?.liabilities ?? 0),
                              )}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
              </section>

              {/* EQUITY */}
              <section>
                <h3 className="font-medium uppercase tracking-wide border-b border-foreground pb-1 mb-2">
                  Equity
                </h3>
                <div className="space-y-1">
                  {equity.length === 0 ? (
                    <div className="text-muted-foreground py-2">No equity balances.</div>
                  ) : (
                    <>
                      {equity.map((row) => (
                        <div
                          key={row.accountId ?? row.name}
                          className={`grid items-center gap-4 pl-4 ${rowGridClass}`}
                        >
                          <span className="text-muted-foreground">{row.code ?? ''}</span>
                          <span className="min-w-0">
                            {row.accountId ? (
                              <a
                                className="link-on-hover block truncate"
                                href={`/dashboard/reports/general-ledger?accountIds=${row.accountId}&asOf=${formatDateInputValue(asOfDate)}`}
                                title={row.name}
                              >
                                {row.name}
                              </a>
                            ) : (
                              <span className="block truncate" title={row.name}>
                                {row.name}
                              </span>
                            )}
                          </span>
                          <span className="text-right tabular-nums">{formatCents(row.amount)}</span>
                          {showCompare ? (
                            <>
                              <span className="text-right tabular-nums">
                                {formatCents(row.compareAmount)}
                              </span>
                              <span className="text-right tabular-nums">
                                {formatCents(row.amount - row.compareAmount)}
                              </span>
                            </>
                          ) : null}
                        </div>
                      ))}
                      <div
                        className={`grid items-center gap-4 pl-8 pt-2 border-t border-muted font-medium ${rowGridClass}`}
                      >
                        <span />
                        <span>Total Equity</span>
                        <span className="text-right tabular-nums">
                          {formatCents(result.totals.equityPlusCYE)}
                        </span>
                        {showCompare ? (
                          <>
                            <span className="text-right tabular-nums">
                              {formatCents(compareTotals?.equityPlusCYE ?? 0)}
                            </span>
                            <span className="text-right tabular-nums">
                              {formatCents(
                                result.totals.equityPlusCYE - (compareTotals?.equityPlusCYE ?? 0),
                              )}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
              </section>

              {/* TOTAL LIABILITIES AND EQUITY */}
              <section className="border-t-2 border-foreground pt-2">
                <div className={`grid items-center gap-4 font-medium ${rowGridClass}`}>
                  <span />
                  <span className="pl-4">Total Liabilities and Equity</span>
                  <span className="text-right tabular-nums">
                    {formatCents(totalLiabilitiesAndEquity)}
                  </span>
                  {showCompare ? (
                    <>
                      <span className="text-right tabular-nums">
                        {formatCents(compareTotalLiabilitiesAndEquity)}
                      </span>
                      <span className="text-right tabular-nums">
                        {formatCents(totalLiabilitiesAndEquity - compareTotalLiabilitiesAndEquity)}
                      </span>
                    </>
                  ) : null}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
