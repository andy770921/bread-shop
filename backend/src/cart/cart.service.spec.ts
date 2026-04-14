import { CartService } from './cart.service';

describe('CartService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('merges a split session cart into the active user cart when both exist', async () => {
    const carts = [
      {
        id: 'user-cart',
        version: 4,
        user_id: 'user-1',
        session_id: 'old-session',
        status: 'active',
        merged_into_cart_id: null,
      },
      {
        id: 'session-cart',
        version: 1,
        user_id: null,
        session_id: 'session-1',
        status: 'active',
        merged_into_cart_id: null,
      },
    ];
    const cartLines = [
      {
        cart_id: 'session-cart',
        product_id: 11,
        quantity: 2,
      },
    ];
    const rpc = jest.fn(async (fn: string, params: Record<string, unknown>) => {
      if (fn === 'upsert_cart_line') {
        const existing = cartLines.find(
          (line) => line.cart_id === params.p_cart_id && line.product_id === params.p_product_id,
        );

        if (existing) {
          existing.quantity += Number(params.p_quantity);
        } else {
          cartLines.push({
            cart_id: String(params.p_cart_id),
            product_id: Number(params.p_product_id),
            quantity: Number(params.p_quantity),
          });
        }

        return { error: null };
      }

      if (fn === 'refresh_cart_aggregates') {
        return { error: null };
      }

      throw new Error(`Unexpected rpc ${fn}`);
    });

    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'carts') {
          const filters: Record<string, unknown> = {};
          const query: any = {};

          query.select = jest.fn(() => query);
          query.eq = jest.fn((field: string, value: unknown) => {
            filters[field] = value;
            return query;
          });
          query.maybeSingle = jest.fn(async () => ({
            data:
              carts.find((cart) =>
                Object.entries(filters).every(([field, value]) => (cart as any)[field] === value),
              ) ?? null,
          }));
          query.insert = jest.fn();
          query.update = jest.fn((payload: Record<string, unknown>) => ({
            eq: jest.fn(async (_field: string, value: unknown) => {
              const target = carts.find((cart) => cart.id === value);
              if (target) {
                Object.assign(target, payload);
              }
              return { error: null };
            }),
          }));

          return query;
        }

        if (table === 'cart_lines') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(async (_field: string, value: unknown) => ({
                data: cartLines.filter((line) => line.cart_id === value),
              })),
            })),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
      rpc,
    };

    const service = new CartService({
      getClient: jest.fn(() => supabase),
    } as any);

    const resolved = await service.resolveCart('session-1', 'user-1');

    expect(resolved).toEqual(expect.objectContaining({ id: 'user-cart', version: 4 }));
    expect(rpc).toHaveBeenCalledWith('upsert_cart_line', {
      p_cart_id: 'user-cart',
      p_product_id: 11,
      p_quantity: 2,
    });
    expect(rpc).toHaveBeenCalledWith('refresh_cart_aggregates', { p_cart_id: 'user-cart' });
    expect(carts.find((cart) => cart.id === 'user-cart')).toEqual(
      expect.objectContaining({
        user_id: 'user-1',
        session_id: 'session-1',
        status: 'active',
      }),
    );
    expect(carts.find((cart) => cart.id === 'session-cart')).toEqual(
      expect.objectContaining({
        status: 'merged',
        merged_into_cart_id: 'user-cart',
      }),
    );
  });

  it('uses the authenticated cart owner when adding an item', async () => {
    const productQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: 101 },
      }),
    };
    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'products') {
          return productQuery;
        }

        throw new Error(`Unexpected table ${table}`);
      }),
      rpc: jest.fn().mockResolvedValue({ error: null }),
    };
    const service = new CartService({
      getClient: jest.fn(() => supabase),
    } as any);
    const expectedCart = {
      cart_id: 'user-cart',
      version: 9,
      items: [],
      subtotal: 0,
      shipping_fee: 0,
      total: 0,
      item_count: 0,
    };

    jest.spyOn(service, 'resolveCart').mockResolvedValue({ id: 'user-cart', version: 8 });
    jest.spyOn(service, 'getCart').mockResolvedValue(expectedCart);

    await expect(service.addItem('session-1', 101, 3, 'user-1')).resolves.toEqual(expectedCart);

    expect(service.resolveCart).toHaveBeenCalledWith('session-1', 'user-1');
    expect(service.getCart).toHaveBeenCalledWith('session-1', 'user-1');
  });
});
