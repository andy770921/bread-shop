import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { cn } from '@/lib/utils';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-4 relative',
        month: 'flex flex-col gap-3',
        month_caption: 'flex h-9 items-center justify-center',
        caption_label: 'text-sm font-medium',
        nav: 'absolute inset-x-0 top-0 z-10 flex h-9 items-center justify-between px-1',
        button_previous: cn(
          'inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border-light',
          'hover:bg-primary-100 focus:outline-none focus-visible:ring-2',
          'aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:pointer-events-none',
          'disabled:cursor-not-allowed disabled:opacity-40 disabled:pointer-events-none',
        ),
        button_next: cn(
          'inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border-light',
          'hover:bg-primary-100 focus:outline-none focus-visible:ring-2',
          'aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:pointer-events-none',
          'disabled:cursor-not-allowed disabled:opacity-40 disabled:pointer-events-none',
        ),
        chevron: 'h-4 w-4',
        month_grid: 'w-full border-collapse',
        weekdays: 'flex w-full',
        weekday: 'flex-1 text-center text-text-tertiary font-normal text-xs py-1',
        weeks: 'flex flex-col gap-1 mt-1',
        week: 'flex w-full',
        day: 'flex-1 aspect-square text-center text-sm p-0 relative',
        day_button: cn(
          'inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-sm mx-auto',
          'hover:bg-primary-100 focus:outline-none focus-visible:ring-2',
          'disabled:cursor-not-allowed disabled:opacity-30 disabled:pointer-events-none',
        ),
        selected: '[&>button]:bg-primary-500 [&>button]:text-white [&>button]:hover:bg-primary-600',
        today: '[&>button]:text-primary-500 [&>button]:font-semibold',
        outside: '[&>button]:text-text-tertiary [&>button]:opacity-50',
        disabled:
          '[&>button]:cursor-not-allowed [&>button]:opacity-30 [&>button]:pointer-events-none',
        range_start: '[&>button]:bg-primary-500 [&>button]:text-white',
        range_end: '[&>button]:bg-primary-500 [&>button]:text-white',
        range_middle: '[&>button]:bg-primary-100 [&>button]:text-primary-700',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClassName }) => {
          const Icon = orientation === 'left' ? ChevronLeft : ChevronRight;
          return <Icon className={cn('h-4 w-4', chevronClassName)} />;
        },
        ...components,
      }}
      {...props}
    />
  );
}
