import { z } from 'zod';

export const pickupSchema = z
  .object({
    method: z.enum(['in_person', 'seven_eleven_frozen']),
    locationId: z.string().uuid().optional(),
    date: z.date().optional(),
    timeSlot: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
  })
  .superRefine((val, ctx) => {
    if (val.method !== 'in_person') {
      ctx.addIssue({
        path: ['method'],
        code: z.ZodIssueCode.custom,
        message: 'pickup_method_unavailable',
      });
      return;
    }
    if (!val.locationId)
      ctx.addIssue({ path: ['locationId'], code: z.ZodIssueCode.custom, message: 'required' });
    if (!val.date)
      ctx.addIssue({ path: ['date'], code: z.ZodIssueCode.custom, message: 'required' });
    if (!val.timeSlot)
      ctx.addIssue({ path: ['timeSlot'], code: z.ZodIssueCode.custom, message: 'required' });
  });

export type PickupValues = z.infer<typeof pickupSchema>;

export function composePickupAt(date: Date, timeSlot: string): string {
  const [h, m] = timeSlot.split(':');
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${h}:${m}:00+08:00`;
}

export interface TaipeiWallClockParts {
  y: number;
  m: number;
  day: number;
  hour: number;
  minute: number;
}

export function taipeiNowParts(now: Date = new Date()): TaipeiWallClockParts {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour);
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    day: Number(parts.day),
    hour: hour === 24 ? 0 : hour,
    minute: Number(parts.minute),
  };
}

export function taipeiToday(now: Date = new Date()): Date {
  const { y, m, day } = taipeiNowParts(now);
  return new Date(y, m - 1, day, 0, 0, 0, 0);
}

export function filterFutureSlots(
  slots: string[],
  date: Date | undefined,
  now: Date = new Date(),
): string[] {
  if (!date) return slots;
  const today = taipeiNowParts(now);
  const sameDay =
    date.getFullYear() === today.y &&
    date.getMonth() + 1 === today.m &&
    date.getDate() === today.day;
  if (!sameDay) return slots;
  return slots.filter((slot) => {
    const [h, m] = slot.split(':').map(Number);
    return h > today.hour || (h === today.hour && m > today.minute);
  });
}
