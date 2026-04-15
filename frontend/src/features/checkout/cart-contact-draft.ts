import type { CartContactDraft, UpsertCartContactDraftRequest } from '@repo/shared';
import type { CartFormValues } from './cart-form';

const DRAFT_FIELDS = [
  'customerName',
  'customerPhone',
  'customerEmail',
  'customerAddress',
  'notes',
  'paymentMethod',
  'lineId',
] as const;

export function toCartContactDraft(values: CartFormValues): UpsertCartContactDraftRequest {
  const draft: UpsertCartContactDraftRequest = {};
  for (const key of DRAFT_FIELDS) {
    const raw = values[key];
    if (raw !== undefined && raw !== null) {
      (draft as any)[key] = typeof raw === 'string' ? raw.trim() : raw;
    }
  }
  return draft;
}

export function isCartContactDraftEmpty(payload: UpsertCartContactDraftRequest): boolean {
  return DRAFT_FIELDS.every((key) => {
    const value = payload[key];
    return value === undefined || value === null || value === '';
  });
}

export function mergeCartContactDraftIntoFormValues(
  draft: CartContactDraft | null | undefined,
): Partial<CartFormValues> {
  if (!draft) return {};

  const result: Partial<CartFormValues> = {};
  if (draft.customerName) result.customerName = draft.customerName;
  if (draft.customerPhone) result.customerPhone = draft.customerPhone;
  if (draft.customerEmail) result.customerEmail = draft.customerEmail;
  if (draft.customerAddress) result.customerAddress = draft.customerAddress;
  if (draft.notes) result.notes = draft.notes;
  if (draft.paymentMethod) result.paymentMethod = draft.paymentMethod;
  if (draft.lineId) result.lineId = draft.lineId;

  return result;
}
