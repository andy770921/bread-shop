import { cartFormSchema, shouldStartLineLogin, toCreateOrderBody } from './cart-form';

const baseValues = {
  customerName: 'Andy',
  customerPhone: '0912345678',
  customerEmail: 'andy@example.com',
  customerAddress: 'Taipei',
  notes: 'Ring bell',
  cardNumber: '',
  cardExpiry: '',
  cardCvv: '',
  cardholderName: '',
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

  it('requires card fields for credit-card checkout', () => {
    const result = cartFormSchema.safeParse({
      ...baseValues,
      paymentMethod: 'credit_card',
    });

    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.cardNumber).toContain('required');
    expect(result.error?.flatten().fieldErrors.cardExpiry).toContain('required');
    expect(result.error?.flatten().fieldErrors.cardCvv).toContain('required');
    expect(result.error?.flatten().fieldErrors.cardholderName).toContain('required');
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

  it('maps credit-card form values to the backend order payload', () => {
    const payload = toCreateOrderBody({
      ...baseValues,
      paymentMethod: 'credit_card',
      cardNumber: '4111111111111111',
      cardExpiry: '12/30',
      cardCvv: '123',
      cardholderName: 'Andy',
    });

    expect(payload).toEqual({
      customer_name: 'Andy',
      customer_phone: '0912345678',
      customer_email: 'andy@example.com',
      customer_address: 'Taipei',
      notes: 'Ring bell',
      payment_method: 'lemon_squeezy',
      customer_line_id: undefined,
      skip_cart_clear: false,
    });
  });
});
