import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { cn } from '@/lib/utils';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({ className, classNames, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays
      className={cn('p-2', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-4',
        month: 'space-y-3',
        caption: 'flex justify-center pt-1 relative items-center',
        caption_label: 'text-sm font-medium',
        nav: 'space-x-1 flex items-center',
        nav_button:
          'inline-flex h-7 w-7 items-center justify-center rounded-md border border-border-light hover:bg-primary-100',
        nav_button_previous: 'absolute left-1',
        nav_button_next: 'absolute right-1',
        table: 'w-full border-collapse',
        head_row: 'flex',
        head_cell: 'text-text-tertiary rounded-md w-9 font-normal text-xs',
        row: 'flex w-full mt-1',
        cell: 'h-9 w-9 text-center text-sm p-0 relative',
        day: cn(
          'inline-flex h-9 w-9 items-center justify-center rounded-md text-sm',
          'hover:bg-primary-100 focus:outline-none focus-visible:ring-2',
          'aria-selected:bg-primary-500 aria-selected:text-white',
          'disabled:opacity-30 disabled:pointer-events-none',
        ),
        day_selected: 'bg-primary-500 text-white hover:bg-primary-600',
        day_today: 'text-primary-500 font-semibold',
        day_outside: 'text-text-tertiary opacity-50',
        day_disabled: 'opacity-30 pointer-events-none',
        day_range_middle: 'bg-primary-100 text-primary-700',
        day_hidden: 'invisible',
        ...classNames,
      }}
      {...props}
    />
  );
}
