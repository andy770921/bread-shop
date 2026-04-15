'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { UpsertCartContactDraftRequest } from '@repo/shared';
import { useCartContactDraft, useUpsertCartContactDraft } from '@/queries/use-cart-contact-draft';
import type { CartFormValues } from './cart-form';
import {
  toCartContactDraft,
  isCartContactDraftEmpty,
  mergeCartContactDraftIntoFormValues,
} from './cart-contact-draft';

const DEBOUNCE_MS = 800;

export function useCartContactDraftSync(form: UseFormReturn<CartFormValues>) {
  const { data: draft, isLoading: isDraftLoading, isFetched } = useCartContactDraft();
  const { mutateAsync: upsertDraft } = useUpsertCartContactDraft();

  const hydratedRef = useRef(false);
  const latestPayloadRef = useRef<UpsertCartContactDraftRequest | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSaveRef = useRef(false);

  // Step 1: Hydrate form once when draft loads
  useEffect(() => {
    if (hydratedRef.current || !isFetched) return;
    hydratedRef.current = true;

    const values = mergeCartContactDraftIntoFormValues(draft);
    if (Object.keys(values).length > 0) {
      skipNextSaveRef.current = true;
      form.reset({ ...form.getValues(), ...values }, { keepDefaultValues: true });
    }
  }, [draft, isFetched, form]);

  // Step 2: Debounced autosave on form changes
  useEffect(() => {
    const subscription = form.watch((values) => {
      if (!hydratedRef.current) return;

      if (skipNextSaveRef.current) {
        skipNextSaveRef.current = false;
        return;
      }

      const payload = toCartContactDraft(values as CartFormValues);
      latestPayloadRef.current = payload;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        if (isCartContactDraftEmpty(payload)) return;
        upsertDraft(payload).catch(() => undefined);
      }, DEBOUNCE_MS);
    });

    return () => {
      subscription.unsubscribe();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [form, upsertDraft]);

  // Step 3: Flush on visibility change (tab hide / minimize)
  const flushDraftNow = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const payload = latestPayloadRef.current ?? toCartContactDraft(form.getValues());
    if (isCartContactDraftEmpty(payload)) return;

    try {
      await upsertDraft(payload);
    } catch {
      // Silent failure — form state is still in memory
    }
  }, [form, upsertDraft]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushDraftNow();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [flushDraftNow]);

  return {
    isDraftHydrating: isDraftLoading || !isFetched,
    flushDraftNow,
  };
}
