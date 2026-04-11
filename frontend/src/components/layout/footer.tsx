'use client';

import Link from 'next/link';
import { useLocale } from '@/hooks/use-locale';

export function Footer() {
  const { t } = useLocale();

  return (
    <footer style={{ backgroundColor: 'var(--bg-footer)' }}>
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {/* About */}
          <div>
            <h3
              className="font-heading mb-4 text-lg font-semibold"
              style={{ color: 'var(--primary-400)' }}
            >
              {t('home.title')}
            </h3>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/#story"
                  className="text-sm transition-opacity hover:opacity-80"
                  style={{ color: 'var(--neutral-400)' }}
                >
                  {t('nav.about')}
                </Link>
              </li>
              <li>
                <Link
                  href="/#process"
                  className="text-sm transition-opacity hover:opacity-80"
                  style={{ color: 'var(--neutral-400)' }}
                >
                  {t('process.title')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Service */}
          <div>
            <h3
              className="font-heading mb-4 text-lg font-semibold"
              style={{ color: 'var(--primary-400)' }}
            >
              {t('nav.cart')}
            </h3>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/cart"
                  className="text-sm transition-opacity hover:opacity-80"
                  style={{ color: 'var(--neutral-400)' }}
                >
                  {t('nav.cart')}
                </Link>
              </li>
              <li>
                <Link
                  href="/orders"
                  className="text-sm transition-opacity hover:opacity-80"
                  style={{ color: 'var(--neutral-400)' }}
                >
                  {t('nav.orders')}
                </Link>
              </li>
              <li>
                <Link
                  href="/auth/login"
                  className="text-sm transition-opacity hover:opacity-80"
                  style={{ color: 'var(--neutral-400)' }}
                >
                  {t('nav.login')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3
              className="font-heading mb-4 text-lg font-semibold"
              style={{ color: 'var(--primary-400)' }}
            >
              {t('nav.contact')}
            </h3>
            <ul className="space-y-2">
              <li>
                <span className="text-sm" style={{ color: 'var(--neutral-400)' }}>
                  Email: papa@bakery.tw
                </span>
              </li>
              <li>
                <span className="text-sm" style={{ color: 'var(--neutral-400)' }}>
                  Tel: (04) 2345-6789
                </span>
              </li>
              <li>
                <span className="text-sm" style={{ color: 'var(--neutral-400)' }}>
                  LINE: @papabakery
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div
          className="mt-10 border-t pt-6 text-center text-xs"
          style={{ borderColor: 'var(--neutral-700)', color: 'var(--neutral-500)' }}
        >
          &copy; {new Date().getFullYear()} {t('home.title')}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
