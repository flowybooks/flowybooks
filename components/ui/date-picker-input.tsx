'use client';

import * as React from 'react';
import { CalendarIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

function parseDateInputValue(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parts = value.split('-');
  if (parts.length !== 3) return undefined;
  const [yearStr, monthStr, dayStr] = parts;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(date: Date | undefined) {
  if (!date) {
    return '';
  }

  return date.toLocaleDateString('en-US', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function isValidDate(date: Date | undefined) {
  if (!date) {
    return false;
  }
  if (isNaN(date.getTime())) {
    return false;
  }
  const year = date.getFullYear();
  return year >= 1900 && year <= 2100;
}

type DatePickerInputProps = {
  id?: string;
  value: string;
  onValueChange: (nextValue: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

function DatePickerInput({
  id,
  value,
  onValueChange,
  placeholder = 'Pick a date',
  disabled,
  className,
}: DatePickerInputProps) {
  const [open, setOpen] = React.useState(false);
  const selected = React.useMemo(() => parseDateInputValue(value), [value]);
  const [month, setMonth] = React.useState<Date | undefined>(selected);
  const [inputValue, setInputValue] = React.useState(formatDate(selected));

  React.useEffect(() => {
    setInputValue(formatDate(selected));
    setMonth(selected);
  }, [selected]);

  return (
    <div className="relative">
      <Input
        id={id}
        value={inputValue}
        placeholder={placeholder}
        disabled={disabled}
        className={cn('bg-background pr-10 h-8 text-xs', className)}
        onChange={(e) => {
          const nextDate = new Date(e.target.value);
          setInputValue(e.target.value);
          if (isValidDate(nextDate)) {
            setMonth(nextDate);
            onValueChange(formatDateInputValue(nextDate));
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            id={id ? `${id}-date-picker` : undefined}
            variant="ghost"
            size="icon-sm"
            className="absolute top-1/2 right-2 size-6 -translate-y-1/2"
            disabled={disabled}
          >
            <CalendarIcon className="size-3.5" />
            <span className="sr-only">Select date</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto overflow-hidden p-0"
          align="end"
          alignOffset={-8}
          sideOffset={10}
        >
          <Calendar
            mode="single"
            selected={selected}
            captionLayout="dropdown"
            {...(month ? { month } : {})}
            onMonthChange={setMonth}
            onSelect={(date) => {
              if (!date) return;
              onValueChange(formatDateInputValue(date));
              setOpen(false);
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export { DatePickerInput };
