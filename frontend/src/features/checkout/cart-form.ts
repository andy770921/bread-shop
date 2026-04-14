import type { CartResponse, CreateOrderRequest } from '@repo/shared';
import { z } from 'zod';

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
  })
  .superRefine((data, ctx) => {
    const addRequired = (path: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message: 'required' });

    if (data.paymentMethod === 'line_transfer' && !data.lineId) {
      addRequired('lineId');
    }
  });

export type CartFormValues = z.infer<typeof cartFormSchema>;
export type CheckoutCreateOrderBody = CreateOrderRequest & { skip_cart_clear?: boolean };

export function isLineTransferPayment(paymentMethod?: CartFormValues['paymentMethod']): boolean {
  return paymentMethod === 'line_transfer';
}

export function shouldStartLineLogin(
  values: Pick<CartFormValues, 'paymentMethod'>,
  hasLineUserId: boolean,
): boolean {
  return isLineTransferPayment(values.paymentMethod) && !hasLineUserId;
}

export function toCreateOrderBody(
  values: CartFormValues,
  cartSnapshot?: CartResponse,
): CheckoutCreateOrderBody {
  const isLineTransfer = isLineTransferPayment(values.paymentMethod);

  if (!isLineTransfer) {
    throw new Error('Credit card service is currently unavailable.');
  }

  return {
    customer_name: values.customerName,
    customer_phone: values.customerPhone,
    customer_email: values.customerEmail || undefined,
    customer_address: values.customerAddress,
    notes: values.notes || undefined,
    payment_method: 'line',
    customer_line_id: values.lineId || undefined,
    ...(cartSnapshot ? { cart_snapshot: cartSnapshot } : {}),
    skip_cart_clear: true,
  };
}
