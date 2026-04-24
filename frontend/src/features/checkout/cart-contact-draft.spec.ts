import {
  toCartContactDraft,
  isCartContactDraftEmpty,
  mergeCartContactDraftIntoFormValues,
} from './cart-contact-draft';
import type { CartFormValues } from './cart-form';

describe('[cart-contact-draft helpers]', () => {
  describe('toCartContactDraft', () => {
    it('trims string fields', () => {
      const values: CartFormValues = {
        customerName: '  Jane  ',
        customerPhone: ' 0912345678 ',
        customerEmail: '',
        customerAddress: 'Taipei',
        notes: '',
        paymentMethod: 'line_transfer',
        lineId: '@jane',
        pickup: { method: 'in_person' },
      };

      const draft = toCartContactDraft(values);

      expect(draft.customerName).toBe('Jane');
      expect(draft.customerPhone).toBe('0912345678');
      expect(draft.customerEmail).toBe('');
      expect(draft.customerAddress).toBe('Taipei');
      expect(draft.paymentMethod).toBe('line_transfer');
      expect(draft.lineId).toBe('@jane');
    });

    it('preserves undefined for missing optional fields', () => {
      const values: CartFormValues = {
        customerName: 'Jane',
        customerPhone: '0912345678',
        customerAddress: 'Taipei',
        paymentMethod: 'credit_card',
        pickup: { method: 'in_person' },
      };

      const draft = toCartContactDraft(values);

      expect(draft.notes).toBeUndefined();
      expect(draft.lineId).toBeUndefined();
    });
  });

  describe('isCartContactDraftEmpty', () => {
    it('returns true when all fields are empty or missing', () => {
      expect(isCartContactDraftEmpty({})).toBe(true);
      expect(
        isCartContactDraftEmpty({
          customerName: '',
          customerPhone: '',
          customerEmail: '',
        }),
      ).toBe(true);
    });

    it('returns false when any field has content', () => {
      expect(isCartContactDraftEmpty({ customerName: 'Jane' })).toBe(false);
      expect(isCartContactDraftEmpty({ paymentMethod: 'credit_card' })).toBe(false);
    });
  });

  describe('mergeCartContactDraftIntoFormValues', () => {
    it('returns empty object for null draft', () => {
      expect(mergeCartContactDraftIntoFormValues(null)).toEqual({});
      expect(mergeCartContactDraftIntoFormValues(undefined)).toEqual({});
    });

    it('maps non-empty draft fields into form values', () => {
      const result = mergeCartContactDraftIntoFormValues({
        customerName: 'Jane',
        customerPhone: '0912345678',
        customerEmail: '',
        customerAddress: 'Taipei',
        notes: '',
        paymentMethod: 'line_transfer',
        lineId: '@jane',
      });

      expect(result.customerName).toBe('Jane');
      expect(result.customerPhone).toBe('0912345678');
      expect(result.customerEmail).toBeUndefined();
      expect(result.customerAddress).toBe('Taipei');
      expect(result.notes).toBeUndefined();
      expect(result.paymentMethod).toBe('line_transfer');
      expect(result.lineId).toBe('@jane');
    });
  });
});
