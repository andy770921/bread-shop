import { LogOut, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAdminAuth } from '@/lib/admin-auth-context';
import { useLocale } from '@/hooks/use-locale';

export function Topbar() {
  const { user, logout } = useAdminAuth();
  const { t } = useLocale();
  const [dark, setDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  return (
    <header className="flex items-center justify-between border-b border-border-light bg-bg-surface px-8 py-4">
      <div className="text-sm text-text-secondary">{user?.email}</div>
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDark((d) => !d)}
          aria-label="toggle theme"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="outline" size="sm" onClick={logout}>
          <LogOut className="mr-2 h-4 w-4" />
          {t('nav.logout')}
        </Button>
      </div>
    </header>
  );
}
