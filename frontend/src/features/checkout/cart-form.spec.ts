import { cartFormSchema } from './cart-form';

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

  it('accepts valid line-transfer checkout input', () => {
    const result = cartFormSchema.safeParse({
      ...baseValues,
      paymentMethod: 'line_transfer',
      lineId: '@andy',
    });

    expect(result.success).toBe(true);
  });
});
