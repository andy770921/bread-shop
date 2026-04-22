import { useState, type FC, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { stringifyQueryKey } from '@repo/shared';
import { defaultFetchFn } from '@/lib/admin-fetchers';

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
            staleTime: 60 * 1000,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

export default TanStackQueryProvider;
