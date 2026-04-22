'use client';

import { useState, FC, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { stringifyQueryKey } from '@repo/shared';
import { defaultFetchFn } from '@/utils/fetchers/fetchers.client';

const TanStackQueryProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 0,
            throwOnError: true,
            queryFn: async ({ queryKey }) => {
              return defaultFetchFn(stringifyQueryKey(queryKey));
            },
            // With SSR, we usually want to set some default staleTime
            // above 0 to avoid refetching immediately on the client
            staleTime: 60 * 1000,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

export default TanStackQueryProvider;
