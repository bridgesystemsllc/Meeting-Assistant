import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function UserMenu() {
  const { me, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (!me) return null;

  const initials = (me.user.name || me.user.email)
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  async function onSignOut() {
    await signOut();
    navigate('/login');
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-left text-sm hover:bg-[var(--color-bg)]"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--color-fg)] text-xs font-medium text-[var(--color-surface)]">
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-[var(--color-fg)]">
            {me.user.name || me.user.email}
          </span>
          <span className="block truncate text-xs text-[var(--color-muted)]">{me.tenant.name}</span>
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 mb-2 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-1"
        >
          <p className="truncate px-2 py-1 text-xs text-[var(--color-muted)]">{me.user.email}</p>
          <p className="px-2 pb-1 font-mono text-xs text-[var(--color-muted)]">{me.role}</p>
          <button
            type="button"
            role="menuitem"
            className="w-full rounded-md px-2 py-1.5 text-left text-sm text-[var(--color-fg)] hover:bg-[var(--color-bg)]"
            onClick={() => void onSignOut()}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
