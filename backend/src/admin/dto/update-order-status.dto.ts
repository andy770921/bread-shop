import { IsIn } from 'class-validator';

export const ORDER_STATUSES = [
  'pending',
  'paid',
  'preparing',
  'shipping',
  'delivered',
  'cancelled',
] as const;
export type OrderStatusValue = (typeof ORDER_STATUSES)[number];

export class UpdateOrderStatusDto {
  @IsIn(ORDER_STATUSES as unknown as string[])
  status!: OrderStatusValue;
}
