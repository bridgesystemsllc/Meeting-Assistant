import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MeetingDetailPage } from './meeting-detail';

function renderDetail(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/meetings/${id}`]}>
      <Routes>
        <Route path="/meetings/:id" element={<MeetingDetailPage />} />
        <Route path="/meetings" element={<p>Meetings list</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('MeetingDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a Meeting not found state on 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 404,
        } as Response)
      )
    );

    renderDetail('00000000-0000-0000-0000-000000000099');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Meeting not found' })).toBeTruthy();
    });
    expect(screen.queryByText('Error')).toBeNull();
    expect(screen.getByText(/does not exist or is not in your workspace/i)).toBeTruthy();
  });

  it('shows a generic error on non-404 failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
        } as Response)
      )
    );

    renderDetail('00000000-0000-0000-0000-000000000099');

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeTruthy();
    });
    expect(screen.queryByRole('heading', { name: 'Meeting not found' })).toBeNull();
  });
});
