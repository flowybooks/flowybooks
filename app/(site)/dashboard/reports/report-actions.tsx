'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PrintButton } from '../print-button';

type ReportActionsProps = {
  exportHref: string;
  printTitle: string;
};

export function ReportActions({ exportHref, printTitle }: ReportActionsProps) {
  return (
    <div className="flex items-center gap-2" data-report-actions>
      <Button asChild variant="outline" size="icon-sm" aria-label="Export Excel">
        <a href={exportHref} title="Export Excel">
          <Download className="h-3.5 w-3.5" />
        </a>
      </Button>
      <PrintButton
        variant="outline"
        size="icon-sm"
        ariaLabel="Print report"
        title="Print report"
        printTitle={printTitle}
      />
    </div>
  );
}
