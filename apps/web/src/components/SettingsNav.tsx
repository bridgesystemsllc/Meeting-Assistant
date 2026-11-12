import { Link, useLocation } from 'react-router-dom';

const links = [
  { to: '/settings/seats', label: 'Seats' },
  { to: '/settings/activity', label: 'Activity' },
  { to: '/settings/consent', label: 'Consent' },
] as const;

export function SettingsNav() {
  const location = useLocation();

  return (
    <nav aria-label="Settings" className="mb-6 flex gap-4 border-b border-[var(--color-border)]">
      {links.map((link) => {
        const current = location.pathname === link.to;
        return (
          <Link
            key={link.to}
            to={link.to}
            aria-current={current ? 'page' : undefined}
            className={`-mb-px border-b-2 pb-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
              current
                ? 'border-[var(--color-fg)] text-[var(--color-fg)]'
                : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-fg)]'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
