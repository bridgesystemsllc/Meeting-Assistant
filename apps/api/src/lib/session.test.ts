import { describe, expect, it } from 'vitest';
import type { AuthSessionContext } from './auth-db.js';
import { toMeResponse } from './session.js';

const acme = { id: '00000000-0000-0000-0000-000000000010', name: 'Acme Notes', slug: 'acme-notes' };
const lumen = { id: '00000000-0000-0000-0000-000000000001', name: 'Lumen & Vale Beauty', slug: 'lumen-vale' };
const user = { id: '00000000-0000-0000-0000-000000000013', email: 'member@example.com', name: 'Morgan Member' };

function ctx(overrides: Partial<AuthSessionContext> & { memberships: AuthSessionContext['memberships'] }): AuthSessionContext {
  return {
    session_id: '00000000-0000-0000-0000-000000000099',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    idle_expires_at: new Date(Date.now() + 60_000).toISOString(),
    active_tenant_id: acme.id,
    user,
    ...overrides,
  };
}

describe('toMeResponse session edge cases', () => {
  it('exposes a deactivated-only membership so the seat guard can return 403', () => {
    const me = toMeResponse(
      ctx({
        memberships: [
          { id: '00000000-0000-0000-0000-000000000024', role: 'member', seat_status: 'deactivated', tenant: acme },
        ],
      })
    );
    expect(me).not.toBeNull();
    expect(me?.seat_status).toBe('deactivated');
    expect(me?.tenant.id).toBe(acme.id);
  });

  it('prefers an active membership over a deactivated tenant even if it is the session tenant', () => {
    const me = toMeResponse(
      ctx({
        active_tenant_id: acme.id,
        memberships: [
          { id: '00000000-0000-0000-0000-000000000024', role: 'member', seat_status: 'deactivated', tenant: acme },
          { id: '00000000-0000-0000-0000-000000000026', role: 'member', seat_status: 'active', tenant: lumen },
        ],
      })
    );
    expect(me?.tenant.id).toBe(lumen.id);
    expect(me?.seat_status).toBe('active');
    expect(me?.memberships).toHaveLength(2);
  });

  it('keeps the active tenant when the user has several active memberships', () => {
    const me = toMeResponse(
      ctx({
        active_tenant_id: lumen.id,
        memberships: [
          { id: '00000000-0000-0000-0000-000000000024', role: 'admin', seat_status: 'active', tenant: acme },
          { id: '00000000-0000-0000-0000-000000000026', role: 'member', seat_status: 'active', tenant: lumen },
        ],
      })
    );
    expect(me?.tenant.id).toBe(lumen.id);
    expect(me?.role).toBe('member');
    expect(me?.seat_status).toBe('active');
  });
});
