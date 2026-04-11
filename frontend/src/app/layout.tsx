import type { Metadata } from 'next';
import { Noto_Serif_TC } from 'next/font/google';
import { Providers } from './providers';
import { cn } from '@/lib/utils';
import './globals.css';

const notoSerifTC = Noto_Serif_TC({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-serif-tc',
  display: 'swap',
});

export const metadata: Metadata = {
  title: '周爸烘焙坊 — Papa Bakery',
  description: '用心烘焙，傳遞幸福',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" suppressHydrationWarning className={cn(notoSerifTC.variable)}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
