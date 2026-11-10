import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ActivityPage } from './activity';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    status: 'authenticated',
    me: {
      user: { id: '00000000-0000-0000-0000-000000000011', email: 'owner@example.com', name: 'Avery Owner' },
      tenant: { id: '00000000-0000-0000-0000-000000000010', name: 'Acme Notes', slug: 'acme-notes' },
      role: 'owner',
      seat_status: 'active',
      memberships: [],
    },
    error: null,
    refresh: vi.fn(),
    signOut: vi.fn(),
  }),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

const firstPage = {
  items: [
    {
      id: '00000000-0000-0000-0000-0000000000aa',
      created_at: '2026-11-10T20:00:00.000Z',
      action: 'invite.sent',
      actor: {
        id: '00000000-0000-0000-0000-000000000011',
        name: 'Avery Owner',
        email: 'owner@example.com',
      },
      target_type: 'invite',
      target_id: '00000000-0000-0000-0000-0000000000bb',
      metadata: { email_masked: 'j***@example.com' },
    },
  ],
  nextCursor: 'cursor-1',
};

const secondPage = {
  items: [
    {
      id: '00000000-0000-0000-0000-0000000000cc',
      created_at: '2026-11-10T19:00:00.000Z',
      action: 'login',
      actor: {
        id: '00000000-0000-0000-0000-000000000011',
        name: 'Avery Owner',
        email: 'owner@example.com',
      },
      target_type: 'user',
      target_id: '00000000-0000-0000-0000-000000000011',
      metadata: {},
    },
  ],
  nextCursor: null,
};

describe('ActivityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the activity table and loads more', async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.includes('cursor=cursor-1')) {
        return Promise.resolve(jsonResponse(secondPage));
      }
      return Promise.resolve(jsonResponse(firstPage));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/settings/activity']}>
        <ActivityPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Invite sent')).toBeTruthy();
    });
    expect(screen.getByRole('heading', { name: 'Activity' })).toBeTruthy();
    expect(screen.getByText('Avery Owner')).toBeTruthy();
    expect(screen.getByText('j***@example.com')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Activity' }).getAttribute('aria-current')).toBe('page');

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => {
      expect(screen.getByText('Signed in')).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('shows a forbidden error for a 403', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ error: { code: 'FORBIDDEN', message: 'no' } }, 403)))
    );

    render(
      <MemoryRouter>
        <ActivityPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/permission/i);
    });
  });
});
