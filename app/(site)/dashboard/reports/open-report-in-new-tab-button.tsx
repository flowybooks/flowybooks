'use client';

import { useReportTabs, type ReportTabType } from '@/app/(site)/dashboard/report-tabs-context';

export function OpenReportInNewTabButton(props: {
  type: ReportTabType;
  params: Record<string, string | null | undefined>;
  label?: string;
}) {
  const { openTab } = useReportTabs();

  return (
    <button
      type="button"
      onClick={() =>
        openTab(props.type, {
          forceNew: true,
          params: props.params,
        })
      }
      className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-[11px] font-medium text-foreground hover:bg-muted/40"
    >
      {props.label ?? 'Open Report in New Tab'}
    </button>
  );
}
