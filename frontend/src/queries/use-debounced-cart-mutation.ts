'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CartResponse } from '@repo/shared';
import { QUERY_KEYS } from './query-keys';
import { EMPTY_CART, PendingCartEntry } from '@/utils/cart-math';

interface PendingEntry extends PendingCartEntry {
  timer?: ReturnType<typeof setTimeout>;
  inFlightQuantity?: number;
  inFlightPromise?: Promise<void>;
}

type PendingController = {
  flush: () => Promise<void>;
};

const pendingControllers = new Set<PendingController>();

export async function flushPendingCartMutations(): Promise<void> {
  const controllers = [...pendingControllers];
  await Promise.all(controllers.map((controller) => controller.flush()));
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
  const unmountedRef = useRef(false);
  const controllerRef = useRef<PendingController>({ flush: async () => undefined });
  onErrorRef.current = options.onError;

  const maybeCleanupController = useCallback(() => {
    if (unmountedRef.current && pendingRef.current.size === 0) {
      pendingControllers.delete(controllerRef.current);
    }
  }, []);

  const executePendingEntry = useCallback(
    async (key: TKey) => {
      const pending = pendingRef.current;
      const entry = pending.get(key);
      if (!entry) return;

      const sentQuantity = entry.quantity;
      if (entry.inFlightPromise && entry.inFlightQuantity === sentQuantity) {
        await entry.inFlightPromise;
        return;
      }

      if (entry.timer) {
        clearTimeout(entry.timer);
        entry.timer = undefined;
      }

      const promise = (async () => {
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
          if (pending.get(key) === entry) {
            entry.inFlightPromise = undefined;
            entry.inFlightQuantity = undefined;
          }

          if (pending.size === 0) {
            serverCartRef.current = null;
          }

          maybeCleanupController();
        }
      })();

      entry.inFlightQuantity = sentQuantity;
      entry.inFlightPromise = promise;
      await promise;
    },
    [maybeCleanupController, options, queryClient],
  );

  useEffect(() => {
    pendingControllers.add(controllerRef.current);
    unmountedRef.current = false;

    return () => {
      unmountedRef.current = true;
      maybeCleanupController();
    };
  }, [maybeCleanupController]);

  controllerRef.current.flush = async () => {
    const keys = [...pendingRef.current.keys()];
    await Promise.all(keys.map((key) => executePendingEntry(key)));
  };

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
      entry.timer = setTimeout(() => {
        void executePendingEntry(key);
      }, 500);
    },
    [executePendingEntry, options, queryClient],
  );

  return { run };
}
