import { cartFormSchema, shouldStartLineLogin, toCreateOrderBody } from './cart-form';

const baseValues = {
  customerName: 'Andy',
  customerPhone: '0912345678',
  customerEmail: 'andy@example.com',
  customerAddress: 'Taipei',
  notes: 'Ring bell',
  lineId: '',
};

describe('[checkout cart-form]', () => {
  it('requires LINE ID for line transfer', () => {
    const result = cartFormSchema.safeParse({
      ...baseValues,
      paymentMethod: 'line_transfer',
    });

    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.lineId).toContain('required');
  });

  it('does not require extra fields for the unavailable credit-card option', () => {
    const result = cartFormSchema.safeParse({
      ...baseValues,
      paymentMethod: 'credit_card',
    });

    expect(result.success).toBe(true);
  });

  it('decides when LINE login must start before checkout submission', () => {
    expect(
      shouldStartLineLogin(
        {
          paymentMethod: 'line_transfer',
        },
        false,
      ),
    ).toBe(true);
    expect(
      shouldStartLineLogin(
        {
          paymentMethod: 'line_transfer',
        },
        true,
      ),
    ).toBe(false);
    expect(
      shouldStartLineLogin(
        {
          paymentMethod: 'credit_card',
        },
        false,
      ),
    ).toBe(false);
  });

  it('maps line-transfer form values to the backend order payload', () => {
    const payload = toCreateOrderBody({
      ...baseValues,
      paymentMethod: 'line_transfer',
      lineId: '@andy',
    });

    expect(payload).toEqual({
      customer_name: 'Andy',
      customer_phone: '0912345678',
      customer_email: 'andy@example.com',
      customer_address: 'Taipei',
      notes: 'Ring bell',
      payment_method: 'line',
      customer_line_id: '@andy',
      skip_cart_clear: true,
    });
  });

  it('rejects credit-card payload mapping because backend checkout was removed', () => {
    expect(() =>
      toCreateOrderBody({
        ...baseValues,
        paymentMethod: 'credit_card',
      }),
    ).toThrow('Credit card service is currently unavailable.');
  });
});
