'use client';

import { useFormContext } from 'react-hook-form';
import { addDays, format, parseISO, startOfToday } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import type { PickupSettingsResponse } from '@repo/shared';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { CartFormValues } from '@/features/checkout/cart-form';
import { useLocale } from '@/hooks/use-locale';

export function PickupDatePicker({ settings }: { settings: PickupSettingsResponse }) {
  const form = useFormContext<CartFormValues>();
  const { t } = useLocale();
  const date = form.watch('pickup.date');

  const today = startOfToday();
  const end = addDays(today, settings.windowDays);
  const closureStart = settings.closureStartDate ? parseISO(settings.closureStartDate) : null;
  const closureEnd = settings.closureEndDate ? parseISO(settings.closureEndDate) : null;

  const disabled = [
    { before: today },
    { after: end },
    (d: Date) => settings.disabledWeekdays.includes(d.getDay()),
    ...(closureStart && closureEnd ? [{ from: closureStart, to: closureEnd }] : []),
  ];

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start text-left font-normal"
          />
        }
      >
        <CalendarIcon className="mr-2 h-4 w-4" />
        {date ? format(date, 'yyyy-MM-dd') : t('cart.pickup.datePlaceholder')}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) =>
            form.setValue('pickup.date', d ?? undefined, {
              shouldValidate: true,
              shouldDirty: true,
            })
          }
          disabled={disabled}
          startMonth={today}
          endMonth={end}
          defaultMonth={date ?? today}
        />
      </PopoverContent>
    </Popover>
  );
}
