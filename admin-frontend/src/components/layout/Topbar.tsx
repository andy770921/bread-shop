import { LogOut, Menu, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { SidebarNav } from '@/components/layout/Sidebar';
import { useAdminAuth } from '@/lib/admin-auth-context';
import { useLocale } from '@/hooks/use-locale';
import { LocaleToggle } from '@/components/LocaleToggle';

export function Topbar() {
  const { user, logout } = useAdminAuth();
  const { t } = useLocale();
  const [dark, setDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border-light bg-bg-surface px-4 py-3 md:static md:px-8 md:py-4">
      <div className="flex min-w-0 items-center gap-2">
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="px-5 py-6">
            <SheetHeader className="sr-only">
              <SheetTitle>{t('app.title')}</SheetTitle>
              <SheetDescription>{t('nav.dashboard')}</SheetDescription>
            </SheetHeader>
            <SidebarNav onNavigate={() => setNavOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="hidden truncate text-sm text-text-secondary md:block">{user?.email}</div>
      </div>
      <div className="flex items-center gap-1 md:gap-3">
        <LocaleToggle />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDark((d) => !d)}
          aria-label="toggle theme"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="outline" size="sm" onClick={logout} aria-label={t('nav.logout')}>
          <LogOut className="h-4 w-4 md:mr-2" />
          <span className="hidden md:inline">{t('nav.logout')}</span>
        </Button>
      </div>
    </header>
  );
}
