'use client';

import Link from 'next/link';
import { useTheme } from 'next-themes';
import { ShoppingCart, Sun, Moon, User, LogOut, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLocale } from '@/hooks/use-locale';
import { useAuth } from '@/lib/auth-context';
import { useCart } from '@/queries/use-cart';
import { useState, useEffect } from 'react';

export function Header() {
  const { locale, t, toggleLocale } = useLocale();
  const { user, isLoading: authLoading, logout } = useAuth();
  const { data: cart } = useCart();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const itemCount = cart?.item_count ?? 0;

  const navLinks = [
    { label: t('nav.home'), href: '/' },
    { label: t('nav.about'), href: '/#story' },
    { label: t('nav.contact'), href: '/#contact' },
  ];

  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-light)',
        boxShadow: 'var(--shadow-header)',
      }}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <span
            className="font-heading text-xl font-bold sm:text-2xl"
            style={{ color: 'var(--primary-500)' }}
          >
            {t('home.title')}
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium transition-colors hover:opacity-80"
              style={{ color: 'var(--text-secondary)' }}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {/* Language Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleLocale}
            className="text-xs font-semibold"
          >
            {locale === 'zh' ? 'EN' : '中'}
          </Button>

          {/* Theme Toggle */}
          {mounted && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          )}

          {/* Auth */}
          {!authLoading && (
            <>
              {user ? (
                <div className="hidden items-center gap-2 md:flex">
                  <Link href="/profile">
                    <Button variant="ghost" size="sm" className="gap-1.5">
                      <User className="h-4 w-4" />
                      <span className="max-w-[80px] truncate">{user.name || user.email}</span>
                    </Button>
                  </Link>
                  <Button variant="ghost" size="icon-sm" onClick={logout} aria-label={t('nav.logout')}>
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Link href="/auth/login" className="hidden md:block">
                  <Button variant="outline" size="sm">
                    {t('nav.login')}
                  </Button>
                </Link>
              )}
            </>
          )}

          {/* Cart */}
          <Link href="/cart" className="relative">
            <Button variant="ghost" size="icon" aria-label={t('nav.cart')}>
              <ShoppingCart className="h-5 w-5" />
            </Button>
            {itemCount > 0 && (
              <Badge
                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full p-0 text-[10px]"
                style={{ backgroundColor: 'var(--primary-500)', color: '#fff' }}
              >
                {itemCount}
              </Badge>
            )}
          </Link>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div
          className="border-t md:hidden"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-light)' }}
        >
          <nav className="flex flex-col gap-1 px-4 py-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
                style={{ color: 'var(--text-secondary)' }}
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            {user ? (
              <>
                <Link
                  href="/profile"
                  className="rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
                  style={{ color: 'var(--text-secondary)' }}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {t('nav.profile')}
                </Link>
                <button
                  onClick={() => {
                    logout();
                    setMobileMenuOpen(false);
                  }}
                  className="rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-muted"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t('nav.logout')}
                </button>
              </>
            ) : (
              <Link
                href="/auth/login"
                className="rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
                style={{ color: 'var(--text-secondary)' }}
                onClick={() => setMobileMenuOpen(false)}
              >
                {t('nav.login')}
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
