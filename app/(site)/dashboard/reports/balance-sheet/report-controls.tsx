'use client';

import { useEffect, useMemo, useState } from 'react';
import { DatePickerInput } from '@/components/ui/date-picker-input';
import { PersistedReportForm } from '../persisted-report-form';
import { OpenReportInNewTabButton } from '../open-report-in-new-tab-button';
import {
  AS_OF_PERIOD_OPTIONS,
  getAsOfForPeriod,
  inferAsOfPeriodMode,
  normalizeAsOfPeriodMode,
  type AsOfPeriodMode,
} from '../report-periods';

export function BalanceSheetReportControls(props: {
  instanceId: string;
  storageKey: string;
  initialAsOf: string;
  initialCompare: string;
  fiscalYearEndMonth: number | null | undefined;
  initialPeriodParam?: string | null;
}) {
  const today = useMemo(() => new Date(), []);
  const explicitPeriod = normalizeAsOfPeriodMode(props.initialPeriodParam ?? null);
  const inferredPeriod = useMemo(
    () =>
      inferAsOfPeriodMode({
        asOf: props.initialAsOf,
        today,
        fiscalYearEndMonth: props.fiscalYearEndMonth,
      }),
    [props.fiscalYearEndMonth, props.initialAsOf, today],
  );

  const [period, setPeriod] = useState<AsOfPeriodMode>(explicitPeriod ?? inferredPeriod);
  const [asOf, setAsOf] = useState(props.initialAsOf);
  const [compare, setCompare] = useState(props.initialCompare);

  useEffect(() => {
    setAsOf(props.initialAsOf);
    setCompare(props.initialCompare);
    setPeriod(explicitPeriod ?? inferredPeriod);
  }, [props.instanceId, props.initialAsOf, props.initialCompare, explicitPeriod, inferredPeriod]);

  useEffect(() => {
    if (period === 'custom') return;
    const nextAsOf = getAsOfForPeriod(period, today, props.fiscalYearEndMonth);
    setAsOf(nextAsOf);
  }, [period, props.fiscalYearEndMonth, today]);

  return (
    <PersistedReportForm
      storageKey={props.storageKey}
      paramNames={['period', 'asOf', 'compare']}
      method="GET"
      className="flex flex-wrap items-end gap-3"
    >
      <input type="hidden" name="instance" value={props.instanceId} />
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="asOf" value={asOf} />

      <div className="flex flex-col">
        <label htmlFor="asOf" className="text-xs font-medium text-muted-foreground">
          As of
        </label>
        <DatePickerInput
          id="asOf"
          value={asOf}
          onValueChange={(next) => {
            setAsOf(next);
            if (period !== 'custom') {
              setPeriod('custom');
            }
          }}
          placeholder="Pick a date"
        />
      </div>

      <div className="flex flex-col">
        <label htmlFor="period" className="text-xs font-medium text-muted-foreground">
          Period
        </label>
        <select
          id="period"
          value={period}
          onChange={(event) => setPeriod(event.target.value as AsOfPeriodMode)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="custom" hidden>
            Custom
          </option>
          {AS_OF_PERIOD_OPTIONS.map((option) => (
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
        type="balance-sheet"
        params={{
          period,
          asOf,
          compare,
        }}
      />
    </PersistedReportForm>
  );
}
