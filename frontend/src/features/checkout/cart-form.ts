import { z } from 'zod';
import { pickupSchema } from '@/features/pickup/pickup-schema';

export const paymentMethods = ['credit_card', 'line_transfer'] as const;

export const cartFormSchema = z
  .object({
    customerName: z.string().min(1, 'required'),
    customerPhone: z.string().min(1, 'required'),
    customerEmail: z.string().email().or(z.literal('')).optional(),
    customerAddress: z.string().min(1, 'required'),
    notes: z.string().optional(),
    paymentMethod: z.enum(paymentMethods, { required_error: 'required' }),
    lineId: z.string().optional(),
    pickup: pickupSchema,
  })
  .superRefine((data, ctx) => {
    const addRequired = (path: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message: 'required' });

    if (data.paymentMethod === 'line_transfer' && !data.lineId) {
      addRequired('lineId');
    }
  });

export type CartFormValues = z.infer<typeof cartFormSchema>;

export function isLineTransferPayment(paymentMethod?: CartFormValues['paymentMethod']): boolean {
  return paymentMethod === 'line_transfer';
}
