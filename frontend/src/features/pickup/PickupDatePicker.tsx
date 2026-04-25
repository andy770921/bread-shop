'use client';

import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { addDays, format, parseISO } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import type { PickupSettingsResponse } from '@repo/shared';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { CartFormValues } from '@/features/checkout/cart-form';
import { useLocale } from '@/hooks/use-locale';
import { usePickupAvailability } from '@/queries/use-pickup-availability';
import { taipeiToday, taipeiYmd } from './pickup-schema';

export function PickupDatePicker({ settings }: { settings: PickupSettingsResponse }) {
  const form = useFormContext<CartFormValues>();
  const { t } = useLocale();
  const date = form.watch('pickup.date');
  const [open, setOpen] = useState(false);

  // Align the picker bounds with the backend validator, which computes the
  // window in Asia/Taipei regardless of host timezone.
  const today = taipeiToday();
  const earliest = addDays(today, settings.leadDays ?? 0);
  const end = addDays(today, settings.windowDays);
  const closureStart = settings.closureStartDate ? parseISO(settings.closureStartDate) : null;
  const closureEnd = settings.closureEndDate ? parseISO(settings.closureEndDate) : null;

  const { data: availability } = usePickupAvailability();
  const fullDateSet = new Set<string>(availability?.fullDates ?? []);

  const disabled = [
    { before: earliest },
    { after: end },
    (d: Date) => settings.disabledWeekdays.includes(d.getDay()),
    ...(closureStart && closureEnd ? [{ from: closureStart, to: closureEnd }] : []),
    // Use Taipei date string so the matcher aligns with the BE's bucketing
    // even when the customer's host timezone is not Taipei.
    (d: Date) => fullDateSet.has(taipeiYmd(d)),
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
          onSelect={(d) => {
            form.setValue('pickup.date', d ?? undefined, {
              shouldValidate: true,
              shouldDirty: true,
            });
            if (d) setOpen(false);
          }}
          disabled={disabled}
          startMonth={today}
          endMonth={end}
          defaultMonth={date ?? today}
        />
      </PopoverContent>
    </Popover>
  );
}
