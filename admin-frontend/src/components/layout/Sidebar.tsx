import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Package, FileText, ShoppingBag, ToggleRight, Layers } from 'lucide-react';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/utils';

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useLocale();

  const items = [
    { to: '/dashboard', icon: LayoutDashboard, label: t('nav.dashboard'), end: true },
    { to: '/dashboard/products', icon: Package, label: t('nav.products'), end: false },
    { to: '/dashboard/content', icon: FileText, label: t('nav.content'), end: false },
    {
      to: '/dashboard/content-blocks',
      icon: Layers,
      label: t('nav.contentBlocks'),
      end: false,
    },
    { to: '/dashboard/orders', icon: ShoppingBag, label: t('nav.orders'), end: false },
    {
      to: '/dashboard/feature-flags',
      icon: ToggleRight,
      label: t('nav.featureFlags'),
      end: false,
    },
  ];

  return (
    <>
      <div className="mb-8 font-serif text-xl font-bold tracking-wide text-primary-700">
        {t('app.title')}
      </div>
      <nav className="flex flex-col gap-2">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-4 py-3 text-sm transition-colors',
                isActive
                  ? 'bg-gradient-to-br from-primary-500 to-primary-600 font-medium text-white shadow-sm'
                  : 'text-text-secondary hover:bg-bg-elevated hover:text-primary-600',
              )
            }
          >
            <it.icon className="h-[18px] w-[18px]" />
            <span>{it.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden h-screen w-[260px] flex-col border-r border-border-light bg-bg-surface px-5 py-6 md:flex">
      <SidebarNav />
    </aside>
  );
}
