'use client';

import * as React from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

type PrintButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  'children' | 'onClick' | 'type'
> & {
  label?: string;
  printTitle?: string;
  iconClassName?: string;
  ariaLabel?: string;
};

export function PrintButton({
  label,
  printTitle,
  iconClassName = 'h-3.5 w-3.5',
  ariaLabel = 'Print',
  title,
  ...buttonProps
}: PrintButtonProps) {
  return (
    <Button
      type="button"
      aria-label={ariaLabel}
      title={title ?? ariaLabel}
      onClick={() => {
        const originalTitle = document.title;
        const html = document.documentElement;
        const previousPrintMode = html.dataset.printMode;
        let restored = false;

        const restore = () => {
          if (restored) return;
          restored = true;

          if (previousPrintMode === undefined) {
            delete html.dataset.printMode;
          } else {
            html.dataset.printMode = previousPrintMode;
          }

          document.title = originalTitle;
          window.removeEventListener('afterprint', restore);
        };

        html.dataset.printMode = 'dashboard';
        document.title = printTitle || originalTitle || 'Flowybooks';
        window.addEventListener('afterprint', restore);
        window.print();
        window.setTimeout(restore, 1000);
      }}
      {...buttonProps}
    >
      <Printer className={iconClassName} />
      {label ? <span>{label}</span> : null}
    </Button>
  );
}
