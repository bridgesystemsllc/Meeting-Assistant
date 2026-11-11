import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SeatsPage } from './seats';

const refresh = vi.fn();

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    status: 'authenticated',
    me: {
      user: { id: '00000000-0000-0000-0000-000000000011', email: 'owner@example.com', name: 'Avery Owner' },
      tenant: { id: '00000000-0000-0000-0000-000000000010', name: 'Acme Notes', slug: 'acme-notes' },
      role: 'owner',
      seat_status: 'active',
      memberships: [],
      seats: { seat_limit: 10, seats_used: 4 },
    },
    error: null,
    refresh,
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

const seatsPayload = {
  seat_limit: 10,
  seats_used: 4,
  members: [
    {
      id: '00000000-0000-0000-0000-000000000022',
      user_id: '00000000-0000-0000-0000-000000000011',
      name: 'Avery Owner',
      email: 'owner@example.com',
      role: 'owner',
      seat_status: 'active',
      last_active: '2026-11-10T20:00:00.000Z',
    },
  ],
  invites: [],
};

describe('SeatsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the member table, invite form, and seats footer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(seatsPayload)))
    );

    render(
      <MemoryRouter>
        <SeatsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Avery Owner')).toBeTruthy();
    });
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Role')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Invite' })).toBeTruthy();
    expect(screen.getByTestId('seats-footer').textContent).toBe('Seats: 4 of 10 used');
  });

  it('submits an invite and updates the footer count', async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.endsWith('/api/v1/tenant/seats/invite')) {
        return Promise.resolve(
          jsonResponse(
            {
              ...seatsPayload,
              seats_used: 5,
              invites: [
                {
                  id: '00000000-0000-0000-0000-000000000099',
                  email: 'jordan@example.com',
                  role: 'member',
                  expires_at: '2026-11-17T00:00:00.000Z',
                  created_at: '2026-11-10T00:00:00.000Z',
                },
              ],
            },
            201
          )
        );
      }
      return Promise.resolve(jsonResponse(seatsPayload));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <SeatsPage />
      </MemoryRouter>
    );

    await screen.findByText('Avery Owner');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jordan@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

    await waitFor(() => {
      expect(screen.getByText('jordan@example.com')).toBeTruthy();
    });
    expect(screen.getByTestId('seats-footer').textContent).toBe('Seats: 5 of 10 used');
    expect(screen.getByRole('button', { name: 'Resend' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeTruthy();
  });
});
