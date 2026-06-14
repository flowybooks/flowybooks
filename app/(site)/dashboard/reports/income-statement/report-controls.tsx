'use client';

import { useEffect, useMemo, useState } from 'react';
import { DatePickerInput } from '@/components/ui/date-picker-input';
import { PersistedReportForm } from '../persisted-report-form';
import { OpenReportInNewTabButton } from '../open-report-in-new-tab-button';
import {
  RANGE_PERIOD_OPTIONS,
  getRangeForPeriod,
  inferRangePeriodMode,
  normalizeRangePeriodMode,
  type RangePeriodMode,
} from '../report-periods';

export function IncomeStatementReportControls(props: {
  instanceId: string;
  storageKey: string;
  initialFrom: string;
  initialTo: string;
  initialCompare: string;
  fiscalYearEndMonth: number | null | undefined;
  initialPeriodParam?: string | null;
}) {
  const today = useMemo(() => new Date(), []);
  const explicitPeriod = normalizeRangePeriodMode(props.initialPeriodParam ?? null);
  const inferredPeriod = useMemo(
    () =>
      inferRangePeriodMode({
        from: props.initialFrom,
        to: props.initialTo,
        today,
        fiscalYearEndMonth: props.fiscalYearEndMonth,
      }),
    [props.fiscalYearEndMonth, props.initialFrom, props.initialTo, today],
  );

  const [period, setPeriod] = useState<RangePeriodMode>(explicitPeriod ?? inferredPeriod);
  const [from, setFrom] = useState(props.initialFrom);
  const [to, setTo] = useState(props.initialTo);
  const [compare, setCompare] = useState(props.initialCompare);

  useEffect(() => {
    setFrom(props.initialFrom);
    setTo(props.initialTo);
    setCompare(props.initialCompare);
    setPeriod(explicitPeriod ?? inferredPeriod);
  }, [
    props.instanceId,
    props.initialFrom,
    props.initialTo,
    props.initialCompare,
    explicitPeriod,
    inferredPeriod,
  ]);

  useEffect(() => {
    if (period === 'custom') return;
    const range = getRangeForPeriod(period, today, props.fiscalYearEndMonth);
    setFrom(range.from);
    setTo(range.to);
  }, [period, props.fiscalYearEndMonth, today]);

  return (
    <PersistedReportForm
      storageKey={props.storageKey}
      paramNames={['period', 'from', 'to', 'compare']}
      method="GET"
      className="flex flex-wrap items-end gap-3"
    >
      <input type="hidden" name="instance" value={props.instanceId} />
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />

      <div className="flex flex-col">
        <label htmlFor="from" className="text-xs font-medium text-muted-foreground">
          From
        </label>
        <DatePickerInput
          id="from"
          value={from}
          onValueChange={(next) => {
            setFrom(next);
            if (period !== 'custom') {
              setPeriod('custom');
            }
            if (next && next > to) {
              setTo(next);
            }
          }}
          placeholder="Pick a date"
          className="w-[200px]"
        />
      </div>

      <div className="flex flex-col">
        <label htmlFor="to" className="text-xs font-medium text-muted-foreground">
          To
        </label>
        <DatePickerInput
          id="to"
          value={to}
          onValueChange={(next) => {
            setTo(next);
            if (period !== 'custom') {
              setPeriod('custom');
            }
            if (next && next < from) {
              setFrom(next);
            }
          }}
          placeholder="Pick a date"
          className="w-[200px]"
        />
      </div>

      <div className="flex flex-col">
        <label htmlFor="period" className="text-xs font-medium text-muted-foreground">
          Period
        </label>
        <select
          id="period"
          value={period}
          onChange={(event) => setPeriod(event.target.value as RangePeriodMode)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="custom" hidden>
            Custom
          </option>
          {RANGE_PERIOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col">
        <label htmlFor="compare" className="text-xs font-medium text-muted-foreground">
          Compare
        </label>
        <select
          id="compare"
          name="compare"
          value={compare}
          onChange={(event) => setCompare(event.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="none">None</option>
          <option value="previous_period">Previous period</option>
          <option value="previous_year">Previous year</option>
        </select>
      </div>

      <button
        type="submit"
        className="inline-flex h-8 items-center rounded-md bg-foreground px-3 text-[11px] font-medium text-background hover:opacity-80"
      >
        Apply
      </button>

      <OpenReportInNewTabButton
        type="income-statement"
        params={{
          period,
          from,
          to,
          compare,
        }}
      />
    </PersistedReportForm>
  );
}
