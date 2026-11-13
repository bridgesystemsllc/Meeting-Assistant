import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConsentSettingsPage } from './consent';

const authState = {
  status: 'authenticated' as const,
  me: {
    user: { id: '00000000-0000-0000-0000-000000000011', email: 'owner@example.com', name: 'Avery Owner' },
    tenant: { id: '00000000-0000-0000-0000-000000000010', name: 'Acme Notes', slug: 'acme-notes' },
    role: 'owner' as string,
    seat_status: 'active',
    memberships: [],
  },
  error: null,
  refresh: vi.fn(),
  signOut: vi.fn(),
};

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => authState,
}));

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

const settingsPayload = {
  botDisplayName: 'Acme Notetaker',
  preJoinNotice: 'This meeting will be recorded and transcribed by an AI notetaker.',
  inCallNotice: 'Acme Notetaker is recording and transcribing for Acme Notes.',
  stopKeywords: ['stop recording'],
  storeAudio: false,
  consentPolicy: 'all_party_notice',
  notifyAttendees: true,
  hasCustomSettings: true,
};

describe('ConsentSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.me.role = 'owner';
  });

  it('shows the consent policy and transcript-only audio storage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(settingsPayload)))
    );

    render(
      <MemoryRouter>
        <ConsentSettingsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('consent-policy').textContent).toBe('All-party notice');
    });
    expect(screen.getByTestId('store-audio').textContent).toMatch(/Transcript only/);
    expect(screen.getByText(/\[PRODUCT NAME\] does not store meeting audio/)).toBeTruthy();
    expect(screen.getByLabelText('Bot display name')).toBeTruthy();
  });

  it('shows the BOT_NAME_NOT_DISCLOSING error code when the name is rejected', async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/v1/consent/validate-bot-name') && init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse(
            { valid: false, code: 'BOT_NAME_NOT_DISCLOSING', error: 'Bot name must disclose recording.' },
            200
          )
        );
      }
      return Promise.resolve(jsonResponse(settingsPayload));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <ConsentSettingsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Bot display name')).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText('Bot display name'), { target: { value: 'Company Bot' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => {
      expect(screen.getByTestId('bot-name-error').textContent).toContain('BOT_NAME_NOT_DISCLOSING');
    });
    expect(screen.getByTestId('bot-name-error').textContent).toMatch(/disclose recording/);
  });
});
