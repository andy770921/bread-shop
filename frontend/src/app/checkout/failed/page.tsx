'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { XCircle, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { useLocale } from '@/hooks/use-locale';

export default function CheckoutFailedPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      }
    >
      <FailedContent />
    </Suspense>
  );
}

function FailedContent() {
  const searchParams = useSearchParams();
  const { t } = useLocale();
  const reason = searchParams.get('reason');

  const isNotFriend = reason === 'not_friend';
  const description = isNotFriend
    ? t('checkout.failedNotFriend')
    : t('checkout.failedLoginDeclined');

  // LINE Official Account add-friend URL
  const addFriendUrl = 'https://line.me/R/ti/p/@737nfsrc';

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: 'var(--bg-body)' }}>
      <Header />
      <main className="flex flex-1 items-center justify-center px-4 py-24">
        <div className="flex max-w-md flex-col items-center text-center">
          <div
            className="mb-6 flex h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: 'var(--warning-500, #f59e0b)' }}
          >
            <XCircle className="h-8 w-8 text-white" />
          </div>

          <h1
            className="font-heading mb-4 text-3xl font-bold"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('checkout.failedTitle')}
          </h1>
          <p className="mb-8" style={{ color: 'var(--text-secondary)' }}>
            {description}
          </p>

          <div className="flex flex-col gap-3 w-full max-w-xs">
            {isNotFriend && (
              <a href={addFriendUrl} target="_blank" rel="noopener noreferrer">
                <Button
                  size="lg"
                  className="w-full gap-2 rounded-full"
                  style={{ backgroundColor: '#06C755', color: '#fff' }}
                >
                  <UserPlus className="h-4 w-4" />
                  {t('checkout.addFriend')}
                </Button>
              </a>
            )}
            <Link href="/cart">
              <Button
                variant={isNotFriend ? 'outline' : 'default'}
                size="lg"
                className="w-full rounded-full"
                style={
                  isNotFriend ? undefined : { backgroundColor: 'var(--primary-500)', color: '#fff' }
                }
              >
                {t('checkout.backToCart')}
              </Button>
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
