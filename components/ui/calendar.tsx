'use client';

import * as React from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';

import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  navLayout = 'around',
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      navLayout={navLayout}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0',
        month: 'grid grid-cols-[auto_1fr_auto] items-center gap-y-4',
        month_caption: 'flex items-center justify-center',
        caption_label: 'flex items-center justify-center gap-1 text-sm font-medium',
        dropdowns: 'flex justify-center gap-1',
        dropdown_root:
          'relative inline-flex h-8 items-center rounded-md border border-input bg-background px-2 text-xs',
        dropdown: 'absolute inset-0 w-full cursor-pointer opacity-0',
        months_dropdown: 'h-8',
        years_dropdown: 'h-8',
        nav: 'space-x-1 flex items-center',
        button_previous: cn(
          buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
          'justify-self-start',
        ),
        button_next: cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'justify-self-end'),
        month_grid: 'col-span-3 w-full border-collapse space-y-1',
        weekdays: 'flex',
        weekday:
          'flex w-9 items-center justify-center text-muted-foreground rounded-md font-normal text-[0.8rem]',
        week: 'flex w-full mt-2',
        day: 'group relative p-0 text-center text-sm focus-within:relative focus-within:z-20',
        day_button: cn(
          buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
          'h-9 w-9 p-0 font-normal',
          'group-data-[outside=true]:text-muted-foreground group-data-[outside=true]:opacity-50',
          'group-data-[disabled=true]:text-muted-foreground group-data-[disabled=true]:opacity-50',
          'group-data-[today=true]:bg-accent group-data-[today=true]:text-accent-foreground group-data-[today=true]:hover:bg-accent group-data-[today=true]:hover:text-accent-foreground',
          'group-data-[selected=true]:bg-primary group-data-[selected=true]:text-primary-foreground group-data-[selected=true]:hover:bg-primary group-data-[selected=true]:hover:text-primary-foreground group-data-[selected=true]:focus:bg-primary group-data-[selected=true]:focus:text-primary-foreground',
        ),
        chevron: 'h-4 w-4',
        ...classNames,
      }}
      components={{
        Chevron: ({ className: iconClassName, orientation, ...iconProps }) => {
          if (orientation === 'left') {
            return <ChevronLeft className={cn('h-4 w-4', iconClassName)} {...iconProps} />;
          }
          if (orientation === 'right') {
            return <ChevronRight className={cn('h-4 w-4', iconClassName)} {...iconProps} />;
          }
          return <ChevronDown className={cn('h-4 w-4', iconClassName)} {...iconProps} />;
        },
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
