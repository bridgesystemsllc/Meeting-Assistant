import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { MeetingsPage } from './meetings';

function renderWithRouter(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe('MeetingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    renderWithRouter(<MeetingsPage />);
    
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeTruthy();
  });

  it('shows error state on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
      } as Response)
    ));

    renderWithRouter(<MeetingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load meetings')).toBeTruthy();
    });
  });

  it('shows empty state when no meetings', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ meetings: [], total: 0 }),
      } as Response)
    ));

    renderWithRouter(<MeetingsPage />);

    await waitFor(() => {
      expect(screen.getByText('No meetings found')).toBeTruthy();
    });
  });

  it('renders meetings on success', async () => {
    const mockMeetings = [
      {
        id: '1',
        title: 'Test Meeting',
        platform: 'zoom',
        status: 'completed',
        started_at: '2026-11-10T14:00:00Z',
        ended_at: '2026-11-10T15:00:00Z',
        duration_seconds: 3600,
        summary: 'Test summary',
        meeting_sentiment: 'positive',
        engagement_score: 85,
        action_item_count: 2,
        language: 'en',
      },
    ];

    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ meetings: mockMeetings, total: 1 }),
      } as Response)
    ));

    renderWithRouter(<MeetingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Meeting')).toBeTruthy();
    });
  });
});
