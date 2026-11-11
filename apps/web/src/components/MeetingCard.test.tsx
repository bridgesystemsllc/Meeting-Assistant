import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { MeetingCard } from './MeetingCard';
import type { MeetingListItem } from '../lib/api';

const mockMeeting: MeetingListItem = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  title: 'Q2 Planning Session',
  platform: 'zoom',
  status: 'completed',
  started_at: '2026-11-10T14:00:00Z',
  ended_at: '2026-11-10T15:00:00Z',
  duration_seconds: 3600,
  summary: 'Discussed Q2 targets and LATAM expansion.',
  meeting_sentiment: 'positive',
  engagement_score: 85,
  action_item_count: 3,
  language: 'en',
};

function renderWithRouter(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe('MeetingCard', () => {
  it('renders meeting title', () => {
    renderWithRouter(<MeetingCard meeting={mockMeeting} />);
    expect(screen.getByText('Q2 Planning Session')).toBeTruthy();
  });

  it('renders platform label', () => {
    renderWithRouter(<MeetingCard meeting={mockMeeting} />);
    expect(screen.getByText('Zoom')).toBeTruthy();
  });

  it('renders status badge', () => {
    renderWithRouter(<MeetingCard meeting={mockMeeting} />);
    expect(screen.getByText('completed')).toBeTruthy();
  });

  it('renders action item count for completed meetings', () => {
    renderWithRouter(<MeetingCard meeting={mockMeeting} />);
    expect(screen.getByText('3 action items')).toBeTruthy();
  });

  it('renders summary when available', () => {
    renderWithRouter(<MeetingCard meeting={mockMeeting} />);
    expect(screen.getByText(/Discussed Q2 targets/)).toBeTruthy();
  });

  it('renders different status variants', () => {
    const recordingMeeting = { ...mockMeeting, status: 'recording' };
    renderWithRouter(<MeetingCard meeting={recordingMeeting} />);
    expect(screen.getByText('recording')).toBeTruthy();
  });
});
