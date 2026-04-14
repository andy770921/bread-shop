import { CART_CONSTANTS, type CartResponse } from '@repo/shared';
import {
  EMPTY_CART,
  applyPendingUpdates,
  recalcCartTotals,
  reconcileWithPending,
} from './cart-math';

function createCart(items: CartResponse['items']): CartResponse {
  return recalcCartTotals(items);
}

describe('[cart-math]', () => {
  it('returns an empty cart shape for no items', () => {
    expect(recalcCartTotals([])).toEqual(EMPTY_CART);
  });

  it('adds shipping below the free-shipping threshold', () => {
    const cart = createCart([
      {
        id: 1,
        product_id: 1,
        quantity: 2,
        line_total: 400,
        product: {
          id: 1,
          name_zh: '蛋糕',
          name_en: 'Cake',
          price: 200,
          image_url: null,
          category_name_zh: '甜點',
          category_name_en: 'Dessert',
        },
      },
    ]);

    expect(cart.shipping_fee).toBe(CART_CONSTANTS.SHIPPING_FEE);
    expect(cart.total).toBe(400 + CART_CONSTANTS.SHIPPING_FEE);
  });

  it('removes shipping at the free-shipping threshold', () => {
    const cart = createCart([
      {
        id: 1,
        product_id: 1,
        quantity: 5,
        line_total: 500,
        product: {
          id: 1,
          name_zh: '蛋糕',
          name_en: 'Cake',
          price: 100,
          image_url: null,
          category_name_zh: '甜點',
          category_name_en: 'Dessert',
        },
      },
    ]);

    expect(cart.shipping_fee).toBe(0);
    expect(cart.total).toBe(500);
  });

  it('preserves optimistic items missing from a stale server response', () => {
    const serverCart = createCart([
      {
        id: 1,
        product_id: 1,
        quantity: 1,
        line_total: 100,
        product: {
          id: 1,
          name_zh: '蛋糕',
          name_en: 'Cake',
          price: 100,
          image_url: null,
          category_name_zh: '甜點',
          category_name_en: 'Dessert',
        },
      },
    ]);
    const optimisticCart = createCart([
      ...serverCart.items,
      {
        id: -2,
        product_id: 2,
        quantity: 1,
        line_total: 80,
        product: {
          id: 2,
          name_zh: '餅乾',
          name_en: 'Cookie',
          price: 80,
          image_url: null,
          category_name_zh: '甜點',
          category_name_en: 'Dessert',
        },
      },
    ]);

    const reconciled = reconcileWithPending(serverCart, new Map([[2, { quantity: 1 }]]), optimisticCart);

    expect(reconciled.items).toHaveLength(2);
    expect(reconciled.items.find((item) => item.product_id === 2)?.quantity).toBe(1);
  });

  it('applies pending quantity overrides by cart-item id', () => {
    const cart = createCart([
      {
        id: 10,
        product_id: 1,
        quantity: 1,
        line_total: 100,
        product: {
          id: 1,
          name_zh: '蛋糕',
          name_en: 'Cake',
          price: 100,
          image_url: null,
          category_name_zh: '甜點',
          category_name_en: 'Dessert',
        },
      },
    ]);

    const updated = applyPendingUpdates(cart, new Map([[10, { quantity: 3 }]]));

    expect(updated.items[0].quantity).toBe(3);
    expect(updated.items[0].line_total).toBe(300);
    expect(updated.item_count).toBe(3);
  });
});
