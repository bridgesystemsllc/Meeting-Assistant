import { Outlet, Link, useLocation } from 'react-router-dom';
import { Calendar, LayoutDashboard, Settings } from 'lucide-react';
import { hasRequiredRole } from '@meeting-assistant/shared';
import { UserMenu } from './UserMenu';
import { useAuth } from '../hooks/useAuth';

const navItems = [
  { path: '/meetings', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/meetings', label: 'Meetings', icon: Calendar },
];

export function Layout() {
  const location = useLocation();
  const { me } = useAuth();
  const isAdmin = me ? hasRequiredRole(me.role, 'admin') : false;
  const seatInactive = me != null && me.seat_status !== 'active';

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
                key={item.label}
                to={item.path}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
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
          {isAdmin && (
            <Link
              to="/settings/seats"
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                location.pathname.startsWith('/settings')
                  ? 'bg-[var(--color-fg)] text-[var(--color-surface)]'
                  : 'text-[var(--color-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-fg)]'
              }`}
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          )}
        </nav>

        <div className="mt-auto">
          <UserMenu />
        </div>
      </aside>

      <main className="ml-60 p-8">
        {seatInactive ? (
          <div>
            <h1 className="text-2xl font-semibold text-[var(--color-fg)]">Seat inactive</h1>
            <p className="mt-2 text-sm text-[var(--color-muted)]">Your seat is inactive. Ask your admin.</p>
          </div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}
