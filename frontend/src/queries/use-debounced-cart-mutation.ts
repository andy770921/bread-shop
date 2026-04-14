'use client';

import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CartResponse } from '@repo/shared';
import { QUERY_KEYS } from './query-keys';
import { EMPTY_CART, PendingCartEntry } from '@/utils/cart-math';

interface PendingEntry extends PendingCartEntry {
  timer: ReturnType<typeof setTimeout>;
}

interface UseDebouncedCartMutationOptions<TKey, TInput> {
  getKey: (input: TInput) => TKey;
  getInitialQuantity: (input: TInput) => number;
  updatePendingEntry: (entry: PendingEntry, input: TInput) => void;
  applyOptimistic: (cart: CartResponse, input: TInput) => CartResponse;
  send: (key: TKey, quantity: number) => Promise<CartResponse>;
  reconcile: (
    serverCart: CartResponse,
    pending: ReadonlyMap<TKey, PendingEntry>,
    optimisticCache?: CartResponse,
  ) => CartResponse;
  onError?: () => void;
}

export function useDebouncedCartMutation<TKey, TInput>(
  options: UseDebouncedCartMutationOptions<TKey, TInput>,
) {
  const queryClient = useQueryClient();
  const pendingRef = useRef<Map<TKey, PendingEntry>>(new Map());
  const serverCartRef = useRef<CartResponse | null>(null);
  const onErrorRef = useRef(options.onError);
  onErrorRef.current = options.onError;

  const run = useCallback(
    (input: TInput) => {
      if (!serverCartRef.current) {
        serverCartRef.current = queryClient.getQueryData<CartResponse>(QUERY_KEYS.cart) ?? {
          ...EMPTY_CART,
          items: [],
        };
      }

      queryClient.setQueryData<CartResponse>(QUERY_KEYS.cart, (current) => {
        const cart = current ?? { ...EMPTY_CART, items: [] };
        return options.applyOptimistic(cart, input);
      });

      const key = options.getKey(input);
      const pending = pendingRef.current;
      const currentEntry = pending.get(key);

      if (currentEntry) {
        clearTimeout(currentEntry.timer);
        options.updatePendingEntry(currentEntry, input);
      } else {
        pending.set(key, {
          quantity: options.getInitialQuantity(input),
          timer: undefined as unknown as ReturnType<typeof setTimeout>,
        });
      }

      const entry = pending.get(key)!;
      entry.timer = setTimeout(async () => {
        const sentQuantity = entry.quantity;

        try {
          const serverCart = await options.send(key, sentQuantity);
          serverCartRef.current = serverCart;

          if (pending.get(key)?.quantity === sentQuantity) {
            pending.delete(key);
          }

          const currentCache = queryClient.getQueryData<CartResponse>(QUERY_KEYS.cart);
          queryClient.setQueryData(
            QUERY_KEYS.cart,
            options.reconcile(serverCart, pending, currentCache),
          );
        } catch {
          if (pending.get(key)?.quantity === sentQuantity) {
            pending.delete(key);
          }

          const rollback = serverCartRef.current ?? { ...EMPTY_CART, items: [] };
          const currentCache = queryClient.getQueryData<CartResponse>(QUERY_KEYS.cart);
          queryClient.setQueryData(
            QUERY_KEYS.cart,
            options.reconcile(rollback, pending, currentCache),
          );
          onErrorRef.current?.();
        } finally {
          if (pending.size === 0) {
            serverCartRef.current = null;
          }
        }
      }, 500);
    },
    [options, queryClient],
  );

  return { run };
}
