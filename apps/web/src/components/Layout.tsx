import { Outlet, Link, useLocation } from 'react-router-dom';
import { Calendar, LayoutDashboard } from 'lucide-react';
import { UserMenu } from './UserMenu';
import { useAuth } from '../hooks/useAuth';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/meetings', label: 'Meetings', icon: Calendar },
];

export function Layout() {
  const location = useLocation();
  const { me } = useAuth();

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-fg)]">
      <aside className="fixed left-0 top-0 flex h-full w-60 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="mb-8">
          <h1 className="text-base font-semibold tracking-tight">[PRODUCT NAME]</h1>
          <p data-testid="tenant-display-name" className="mt-1 text-xs text-[var(--color-muted)]">
            {me?.tenant.name ?? 'Meetings'}
          </p>
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              location.pathname === item.path ||
              (item.path === '/meetings' && location.pathname.startsWith('/meetings'));
            const Icon = item.icon;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
                  isActive
                    ? 'bg-[var(--color-fg)] text-[var(--color-surface)]'
                    : 'text-[var(--color-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-fg)]'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto">
          <UserMenu />
        </div>
      </aside>

      <main className="ml-60 p-8">
        <Outlet />
      </main>
    </div>
  );
}
