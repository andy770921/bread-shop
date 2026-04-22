'use client';

import { ThemeProvider } from 'next-themes';
import TanStackQueryProvider from '@/vendors/tanstack-query/provider';
import { AuthProvider } from '@/lib/auth-context';
import { Toaster } from '@/components/ui/sonner';
import { LocaleProvider } from '@/hooks/use-locale';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <TanStackQueryProvider>
        <LocaleProvider>
          <AuthProvider>
            {children}
            <Toaster />
          </AuthProvider>
        </LocaleProvider>
      </TanStackQueryProvider>
    </ThemeProvider>
  );
}
