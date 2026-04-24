'use client';

import { useFormContext } from 'react-hook-form';
import { cn } from '@/lib/utils';
import type { CartFormValues } from '@/features/checkout/cart-form';

export function PickupTimeSlotRadio({ slots }: { slots: string[] }) {
  const form = useFormContext<CartFormValues>();
  const selected = form.watch('pickup.timeSlot');

  if (!slots.length) {
    return (
      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
        —
      </p>
    );
  }

  return (
    <div role="radiogroup" className="flex flex-wrap gap-2">
      {slots.map((slot) => {
        const isSelected = selected === slot;
        return (
          <button
            key={slot}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() =>
              form.setValue('pickup.timeSlot', slot, {
                shouldValidate: true,
                shouldDirty: true,
              })
            }
            className={cn(
              'rounded-md border px-4 py-2 text-sm transition-colors',
              'focus-visible:outline-none focus-visible:ring-2',
            )}
            style={{
              backgroundColor: isSelected ? 'var(--primary-500)' : 'var(--bg-surface)',
              color: isSelected ? '#fff' : 'var(--text-primary)',
              borderColor: isSelected ? 'var(--primary-500)' : 'var(--border-default)',
            }}
          >
            {slot}
          </button>
        );
      })}
    </div>
  );
}
