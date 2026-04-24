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
