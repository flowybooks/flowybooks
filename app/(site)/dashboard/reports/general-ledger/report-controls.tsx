'use client';

import { useEffect, useMemo, useState } from 'react';
import { DatePickerInput } from '@/components/ui/date-picker-input';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { PersistedReportForm } from '../persisted-report-form';
import { OpenReportInNewTabButton } from '../open-report-in-new-tab-button';
import {
  RANGE_PERIOD_OPTIONS,
  getRangeForPeriod,
  inferRangePeriodMode,
  normalizeRangePeriodMode,
  type RangePeriodMode,
} from '../report-periods';

type AccountOption = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
};

function buildAccountLabel(account: AccountOption): string {
  return `${account.code} - ${account.name}`;
}

export function GeneralLedgerReportControls(props: {
  instanceId: string;
  storageKey: string;
  initialFrom: string;
  initialTo: string;
  fiscalYearEndMonth: number | null | undefined;
  initialPeriodParam?: string | null;
  accounts: AccountOption[];
  initialAccountIds: string[];
  asOf?: string | null;
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
  const [accountIds, setAccountIds] = useState<Set<string>>(() => new Set(props.initialAccountIds));
  const [accountSearch, setAccountSearch] = useState('');

  useEffect(() => {
    setFrom(props.initialFrom);
    setTo(props.initialTo);
    setPeriod(explicitPeriod ?? inferredPeriod);
    setAccountIds(new Set(props.initialAccountIds));
    setAccountSearch('');
  }, [
    props.instanceId,
    props.initialFrom,
    props.initialTo,
    explicitPeriod,
    inferredPeriod,
    props.initialAccountIds,
  ]);

  useEffect(() => {
    if (period === 'custom') return;
    const range = getRangeForPeriod(period, today, props.fiscalYearEndMonth);
    setFrom(range.from);
    setTo(range.to);
  }, [period, props.fiscalYearEndMonth, today]);

  const accountById = useMemo(() => {
    return new Map(props.accounts.map((account) => [account.id, account]));
  }, [props.accounts]);

  const selectedAccountList = useMemo(() => {
    const selected = Array.from(accountIds)
      .map((id) => accountById.get(id))
      .filter(Boolean) as AccountOption[];
    selected.sort((a, b) => a.code.localeCompare(b.code));
    return selected;
  }, [accountById, accountIds]);

  const accountIdsValue = useMemo(() => {
    if (selectedAccountList.length === 0) {
      return '';
    }
    return selectedAccountList.map((account) => account.id).join(',');
  }, [selectedAccountList]);

  const accountTriggerLabel = useMemo(() => {
    if (selectedAccountList.length === 0) {
      return 'All accounts';
    }
    if (selectedAccountList.length === 1) {
      return buildAccountLabel(selectedAccountList[0]!);
    }
    return `${selectedAccountList.length} accounts`;
  }, [selectedAccountList]);

  const filteredAccounts = useMemo(() => {
    const query = accountSearch.trim().toLowerCase();
    if (!query) {
      return props.accounts;
    }
    return props.accounts.filter((account) => {
      return (
        account.code.toLowerCase().includes(query) || account.name.toLowerCase().includes(query)
      );
    });
  }, [accountSearch, props.accounts]);

  return (
    <PersistedReportForm
      storageKey={props.storageKey}
      paramNames={['period', 'from', 'to', 'accountIds']}
      method="GET"
      className="flex flex-wrap items-end gap-3"
    >
      <input type="hidden" name="instance" value={props.instanceId} />
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      <input type="hidden" name="accountIds" value={accountIdsValue} />

      {props.asOf ? <input type="hidden" name="asOf" value={props.asOf} /> : null}

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
        <label className="text-xs font-medium text-muted-foreground">GL Account #</label>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex h-8 w-[220px] items-center justify-between gap-2 rounded-md border border-input bg-background px-2 text-left text-xs"
            >
              <span className="truncate">{accountTriggerLabel}</span>
              <ChevronDownIcon className="size-3 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[360px] p-2" align="start">
            <Input
              value={accountSearch}
              onChange={(event) => setAccountSearch(event.target.value)}
              placeholder="Search accounts..."
              className="h-8 text-xs"
            />
            <div className="mt-2 max-h-72 overflow-auto rounded-md border">
              <button
                type="button"
                className="flex w-full items-center justify-between px-2 py-1.5 text-xs hover:bg-muted/40"
                onClick={() => setAccountIds(new Set())}
              >
                <span>All accounts</span>
                {selectedAccountList.length === 0 ? (
                  <CheckIcon className="size-4 text-muted-foreground" />
                ) : null}
              </button>
              <div className="h-px bg-border" />
              {filteredAccounts.length === 0 ? (
                <div className="px-2 py-3 text-xs text-muted-foreground">No matching accounts.</div>
              ) : (
                filteredAccounts.map((account) => {
                  const checked = accountIds.has(account.id);
                  return (
                    <button
                      key={account.id}
                      type="button"
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted/40"
                      onClick={() => {
                        setAccountIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(account.id)) {
                            next.delete(account.id);
                          } else {
                            next.add(account.id);
                          }
                          return next;
                        });
                      }}
                    >
                      <span className="flex w-4 justify-center">
                        {checked ? <CheckIcon className="size-4 text-muted-foreground" /> : null}
                      </span>
                      <span className={account.isActive ? '' : 'text-muted-foreground'}>
                        {buildAccountLabel(account)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <button
        type="submit"
        className="inline-flex h-8 items-center rounded-md bg-foreground px-3 text-[11px] font-medium text-background hover:opacity-80"
      >
        Apply
      </button>

      <OpenReportInNewTabButton
        type="general-ledger"
        params={{
          period,
          from,
          to,
          accountIds: accountIdsValue ? accountIdsValue : undefined,
          asOf: props.asOf ?? undefined,
        }}
      />
    </PersistedReportForm>
  );
}
