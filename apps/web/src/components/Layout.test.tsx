import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Layout } from './Layout';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    status: 'authenticated',
    me: {
      user: {
        id: '00000000-0000-0000-0000-000000000011',
        email: 'owner@example.com',
        name: 'Avery Owner',
      },
      tenant: {
        id: '00000000-0000-0000-0000-000000000010',
        name: 'Acme Notes',
        slug: 'acme-notes',
      },
      role: 'owner',
      seat_status: 'active',
      memberships: [],
    },
    error: null,
    refresh: vi.fn(),
    signOut: vi.fn(),
  }),
}));

describe('Layout', () => {
  it('shows the tenant display name from /me', () => {
    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    );

    expect(screen.getByTestId('tenant-display-name').textContent).toBe('Acme Notes');
  });
});
