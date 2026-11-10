import { describe, it, expect } from 'vitest';
import { hasRequiredRole, MeResponseSchema, GLOBAL_TABLES } from './auth.js';

describe('role matrix', () => {
  it('allows owner for every required role', () => {
    expect(hasRequiredRole('owner', 'member')).toBe(true);
    expect(hasRequiredRole('owner', 'admin')).toBe(true);
    expect(hasRequiredRole('owner', 'owner')).toBe(true);
  });

  it('allows admin for admin and member, not owner', () => {
    expect(hasRequiredRole('admin', 'member')).toBe(true);
    expect(hasRequiredRole('admin', 'admin')).toBe(true);
    expect(hasRequiredRole('admin', 'owner')).toBe(false);
  });

  it('allows member only for member', () => {
    expect(hasRequiredRole('member', 'member')).toBe(true);
    expect(hasRequiredRole('member', 'admin')).toBe(false);
    expect(hasRequiredRole('member', 'owner')).toBe(false);
  });

  it('matches an explicit role list', () => {
    expect(hasRequiredRole('admin', ['admin', 'owner'])).toBe(true);
    expect(hasRequiredRole('member', ['admin', 'owner'])).toBe(false);
  });
});

describe('MeResponseSchema', () => {
  it('accepts a valid /me payload', () => {
    const parsed = MeResponseSchema.parse({
      user: { id: '00000000-0000-0000-0000-000000000002', email: 'owner@example.com', name: 'Owner' },
      tenant: { id: '00000000-0000-0000-0000-000000000010', name: 'Acme Notes', slug: 'acme-notes' },
      role: 'owner',
      memberships: [
        {
          id: '00000000-0000-0000-0000-000000000020',
          role: 'owner',
          seat_status: 'active',
          tenant: { id: '00000000-0000-0000-0000-000000000010', name: 'Acme Notes', slug: 'acme-notes' },
        },
      ],
    });
    expect(parsed.role).toBe('owner');
  });
});

describe('GLOBAL_TABLES', () => {
  it('lists the ATLAS Q4 allow-list', () => {
    expect([...GLOBAL_TABLES].sort()).toEqual(
      ['oidc_login_state', 'sessions', 'tenants', 'user_identities', 'users', 'webhook_events'].sort()
    );
  });
});
