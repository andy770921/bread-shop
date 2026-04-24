'use client';

import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import type { PickupLocation } from '@repo/shared';

import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocale } from '@/hooks/use-locale';
import { pickLocalizedText } from '@/i18n/utils';
import type { CartFormValues } from '@/features/checkout/cart-form';

import { usePickupSettings } from './use-pickup-settings';
import { PickupDatePicker } from './PickupDatePicker';
import { PickupTimeSlotRadio } from './PickupTimeSlotRadio';
import { filterFutureSlots } from './pickup-schema';

// NOTE: Pickup fields intentionally do NOT persist via CartContactDraft — see
// documents/FEAT-10/development/customer-frontend.md "Notes" for rationale.

export function PickupSection() {
  const form = useFormContext<CartFormValues>();
  const { locale, t } = useLocale();
  const { data, isLoading, isError } = usePickupSettings();

  const method = form.watch('pickup.method');
  const selectedDate = form.watch('pickup.date');
  const selectedSlot = form.watch('pickup.timeSlot');

  const availableSlots = filterFutureSlots(data?.timeSlots ?? [], selectedDate);

  // If the user had picked a slot that just dropped off the available list
  // (e.g. the hour has since passed today), clear it so isValid reflects reality
  // and the radio does not show a stale highlight.
  useEffect(() => {
    if (selectedSlot && !availableSlots.includes(selectedSlot)) {
      form.setValue('pickup.timeSlot', undefined, { shouldValidate: true });
    }
  }, [selectedSlot, availableSlots, form]);

  if (isLoading) {
    return <Skeleton className="h-48 w-full rounded-xl" />;
  }

  if (isError || !data) {
    return (
      <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
        {t('cart.pickup.loadError')}
      </p>
    );
  }

  const renderLocationName = (loc: PickupLocation) =>
    pickLocalizedText(locale, { zh: loc.label_zh, en: loc.label_en });

  return (
    <div
      className="space-y-4 rounded-xl border p-6"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-light)',
      }}
    >
      <h2 className="font-heading text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
        {t('cart.pickup.title')}
      </h2>

      <FormField
        control={form.control}
        name="pickup.method"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('cart.pickup.methodLabel')} *</FormLabel>
            <FormControl>
              <select
                value={field.value ?? 'in_person'}
                onChange={(e) => field.onChange(e.target.value)}
                onBlur={field.onBlur}
                disabled
                className="select-chevron flex h-10 w-full rounded-md border pl-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-default)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="in_person">{t('cart.pickup.methodInPerson')}</option>
                <option value="seven_eleven_frozen">{t('cart.pickup.methodSevenEleven')}</option>
              </select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {method === 'seven_eleven_frozen' && (
        <p
          className="rounded-lg border border-dashed p-4 text-sm"
          style={{
            backgroundColor: 'var(--bg-body)',
            borderColor: 'var(--border-default)',
            color: 'var(--text-secondary)',
          }}
        >
          {t('cart.pickup.sevenElevenNotice')}
        </p>
      )}

      {method === 'in_person' && (
        <>
          <FormField
            control={form.control}
            name="pickup.locationId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('cart.pickup.locationLabel')} *</FormLabel>
                <FormControl>
                  <select
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value || undefined)}
                    onBlur={field.onBlur}
                    className="select-chevron flex h-10 w-full rounded-md border pl-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-default)',
                      color: field.value ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    }}
                  >
                    <option value="">{t('cart.pickup.locationPlaceholder')}</option>
                    {data.locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {renderLocationName(loc)}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="pickup.date"
            render={() => (
              <FormItem>
                <FormLabel>{t('cart.pickup.dateLabel')} *</FormLabel>
                <FormControl>
                  <PickupDatePicker settings={data} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="pickup.timeSlot"
            render={() => (
              <FormItem>
                <FormLabel>{t('cart.pickup.timeSlotLabel')} *</FormLabel>
                <FormControl>
                  <PickupTimeSlotRadio slots={availableSlots} />
                </FormControl>
                {selectedDate && availableSlots.length === 0 && (
                  <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                    {t('cart.pickup.noSlotsToday')}
                  </p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        </>
      )}
    </div>
  );
}
