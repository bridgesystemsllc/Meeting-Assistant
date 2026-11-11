import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { InvitePage } from './invite';

describe('InvitePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows sign-in actions for a valid invite', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              email: 'jordan@example.com',
              role: 'member',
              expires_at: '2026-11-17T00:00:00.000Z',
              tenant: { id: '00000000-0000-0000-0000-000000000010', name: 'Acme Notes', slug: 'acme-notes' },
            }),
        } as Response)
      )
    );

    render(
      <MemoryRouter initialEntries={['/invite/tok123?tenant=acme-notes']}>
        <Routes>
          <Route path="/invite/:token" element={<InvitePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/join Acme Notes/i)).toBeTruthy();
    });
    expect(screen.getByRole('link', { name: /continue with google/i }).getAttribute('href')).toBe(
      '/api/v1/auth/login/google?invite=tok123'
    );
  });

  it('shows a clean error for a used invite', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: { code: 'INVITE_USED', message: 'used' } }),
        } as Response)
      )
    );

    render(
      <MemoryRouter initialEntries={['/invite/used']}>
        <Routes>
          <Route path="/invite/:token" element={<InvitePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/already been used/i);
    });
  });
});
