export type OrderStatus = 'pending' | 'paid' | 'preparing' | 'shipping' | 'delivered' | 'cancelled';
export type PaymentMethod = 'lemon_squeezy' | 'line';

export interface CreateOrderRequest {
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  customer_address: string;
  notes?: string;
  payment_method: PaymentMethod;
  customer_line_id?: string;
}

export interface OrderItem {
  id: number;
  product_id: number;
  product_name_zh: string;
  product_name_en: string;
  product_price: number;
  quantity: number;
  subtotal: number;
}

export interface Order {
  id: number;
  order_number: string;
  status: OrderStatus;
  subtotal: number;
  shipping_fee: number;
  total: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  customer_address: string;
  notes: string | null;
  payment_method: PaymentMethod | null;
  customer_line_id: string | null;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
}

export interface OrderListResponse {
  orders: Omit<Order, 'items'>[];
}

export interface CheckoutResponse {
  checkout_url: string;
}

export interface LineSendResponse {
  success: boolean;
  message: string;
}
