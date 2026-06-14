'use client';

import { useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useReportTabs, type ReportTab } from './report-tabs-context';

function formatDateLabel(value?: string | null): string {
  if (!value) return '';
  const [yearStr, monthStr, dayStr] = value.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!year || !month || !day) return value;
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatRangeLabel(from?: string | null, to?: string | null): string {
  if (!from || !to) return '';
  return `${formatDateLabel(from)} - ${formatDateLabel(to)}`;
}

function getTabLabel(tab: ReportTab, baseLabel: string): string {
  const queryIndex = tab.href.indexOf('?');
  const params = new URLSearchParams(queryIndex >= 0 ? tab.href.slice(queryIndex + 1) : '');

  if (params.has('asOf')) {
    const asOf = params.get('asOf');
    const label = formatDateLabel(asOf);
    return label ? `${baseLabel} (${label})` : baseLabel;
  }

  if (params.has('from') && params.has('to')) {
    const range = formatRangeLabel(params.get('from'), params.get('to'));
    return range ? `${baseLabel} (${range})` : baseLabel;
  }

  return baseLabel;
}

export function ReportTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const { tabs, activeTabId, closeTab, closeAllTabs, openTab, setActiveTab, tabDefinitions } =
    useReportTabs();

  const currentHref = useMemo(
    () => (searchParamsKey ? `${pathname}?${searchParamsKey}` : pathname),
    [pathname, searchParamsKey],
  );

  const tabLabels = useMemo(() => {
    return tabs.map((tab) => {
      const baseLabel = tabDefinitions[tab.type].label;
      const hrefForLabel = tab.id === activeTabId ? currentHref : tab.href;
      return {
        ...tab,
        label: getTabLabel({ ...tab, href: hrefForLabel }, baseLabel),
      };
    });
  }, [tabs, tabDefinitions, activeTabId, currentHref]);

  return (
    <div className="w-full md:max-w-[42rem] lg:max-w-[44rem] xl:max-w-[46rem]">
      <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-md border bg-background/80 px-2.5 py-1.5 shadow-sm">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {tabLabels.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={`${tab.type}-${tab.id}`}
                className={`group flex min-w-0 max-w-[190px] items-center rounded-md ${
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className="min-w-0 flex-1 truncate px-2 py-1 text-[11px] font-medium leading-4"
                >
                  {tab.label}
                </button>
                <button
                  type="button"
                  onClick={() => closeTab(tab.id)}
                  className={`mr-0.5 p-0.5 transition-opacity ${
                    isActive
                      ? 'opacity-60 hover:opacity-100'
                      : 'opacity-0 group-hover:opacity-60 hover:opacity-100'
                  }`}
                  aria-label={`Close ${tab.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}

          {tabLabels.length === 0 ? (
            <div className="px-1 text-[11px] text-muted-foreground">
              Click the sidebar menu to get started.
            </div>
          ) : null}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2 text-xs font-medium text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            onClick={closeAllTabs}
            disabled={tabs.length === 0}
          >
            <X className="h-3 w-3" />
            Close all
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                New Tab
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              {(Object.keys(tabDefinitions) as Array<keyof typeof tabDefinitions>).map((key) => (
                <DropdownMenuItem key={key} onSelect={() => openTab(key, { forceNew: true })}>
                  {tabDefinitions[key].label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
