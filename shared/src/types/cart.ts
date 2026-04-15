export interface CartItem {
  id: number | string;
  product_id: number;
  quantity: number;
  product: {
    id: number;
    name_zh: string;
    name_en: string;
    price: number;
    image_url: string | null;
    category_name_zh: string;
    category_name_en: string;
  };
  line_total: number;
}

export interface CartResponse {
  cart_id: string | null;
  version: number;
  items: CartItem[];
  subtotal: number;
  shipping_fee: number;
  total: number;
  item_count: number;
}

export interface AddToCartRequest {
  product_id: number;
  quantity: number;
}

export interface UpdateCartItemRequest {
  quantity: number;
}

export interface CartContactDraft {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  notes: string;
  paymentMethod?: 'credit_card' | 'line_transfer';
  lineId: string;
}

export type UpsertCartContactDraftRequest = Partial<CartContactDraft>;
