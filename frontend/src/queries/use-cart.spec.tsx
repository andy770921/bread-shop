import { renderHook } from '@testing-library/react';
import { useAddToCart } from './use-cart';
import { EMPTY_CART } from '@/utils/cart-math';

jest.mock('./cart-session', () => ({
  ensureCartSessionReady: jest.fn(),
  fetchCart: jest.fn(),
  primeCartSessionReady: jest.fn(),
}));

jest.mock('./use-debounced-cart-mutation', () => ({
  useDebouncedCartMutation: jest.fn(),
}));

jest.mock('@/utils/fetchers/fetchers.client', () => ({
  authedFetchFn: jest.fn(),
}));

describe('[use-cart]', () => {
  const { primeCartSessionReady } = jest.requireMock('./cart-session') as {
    primeCartSessionReady: jest.Mock;
  };
  const { useDebouncedCartMutation } = jest.requireMock('./use-debounced-cart-mutation') as {
    useDebouncedCartMutation: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds optimistic cart items from the provided product snapshot', () => {
    let capturedOptions: any;

    useDebouncedCartMutation.mockImplementation((options) => {
      capturedOptions = options;
      return { run: jest.fn() };
    });

    renderHook(() => useAddToCart());

    const productSnapshot = {
      id: 101,
      name_zh: '草莓蛋糕',
      name_en: 'Strawberry Cake',
      price: 380,
      image_url: 'https://example.com/cake.jpg',
      category_slug: 'cake',
    };

    const optimisticCart = capturedOptions.applyOptimistic(EMPTY_CART, {
      productId: 101,
      product: productSnapshot,
    });

    expect(optimisticCart.items[0].product).toEqual(productSnapshot);
    expect(optimisticCart.items[0].line_total).toBe(380);
  });

  it('merges richer product metadata into existing optimistic rows and primes the session', () => {
    let capturedOptions: any;
    const run = jest.fn();

    useDebouncedCartMutation.mockImplementation((options) => {
      capturedOptions = options;
      return { run };
    });

    const { result } = renderHook(() => useAddToCart());

    const productSnapshot = {
      id: 101,
      name_zh: '草莓蛋糕',
      name_en: 'Strawberry Cake',
      price: 380,
      image_url: 'https://example.com/cake.jpg',
      category_slug: 'cake',
    };

    result.current.addToCart({
      productId: 101,
      product: productSnapshot,
    });

    expect(primeCartSessionReady).toHaveBeenCalled();
    expect(run).toHaveBeenCalledWith({
      productId: 101,
      product: productSnapshot,
    });

    const existingCart = {
      ...EMPTY_CART,
      items: [
        {
          id: -1,
          product_id: 101,
          quantity: 1,
          product: {
            ...productSnapshot,
            name_zh: '',
            name_en: '',
            image_url: null,
          },
          line_total: 380,
        },
      ],
    };

    const optimisticCart = capturedOptions.applyOptimistic(existingCart, {
      productId: 101,
      product: productSnapshot,
    });

    expect(optimisticCart.items[0].product).toEqual(productSnapshot);
    expect(optimisticCart.items[0].quantity).toBe(2);
    expect(optimisticCart.items[0].line_total).toBe(760);
  });
});
