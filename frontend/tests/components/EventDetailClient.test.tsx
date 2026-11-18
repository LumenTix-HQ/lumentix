import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  EventAgeRestriction,
  EventCategory,
  EventStatus,
  type Event,
} from '@/types/event';

const useAuth = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuth(),
}));

vi.mock('@/components/reviews/SentimentPanel', () => ({
  SentimentPanel: () => <div data-testid="sentiment-panel">sentiment</div>,
}));
vi.mock('@/components/venues/SeatMap', () => ({
  default: () => <div data-testid="seat-map" />,
}));
vi.mock('@/components/VenueMap', () => ({
  default: () => <div data-testid="venue-map" />,
}));
vi.mock('@/components/SponsorBanner', () => ({
  SponsorBanner: () => <div data-testid="sponsor-banner" />,
}));

// eslint-disable-next-line import/first
import EventDetailClient from '@/components/events/EventDetailClient';

const event: Event = {
  id: 'evt-1',
  title: 'Test Event',
  description: 'A test event',
  location: 'Accra, Ghana',
  startDate: '2026-06-14T18:00:00Z',
  endDate: '2026-06-14T22:00:00Z',
  ticketPrice: 10,
  currency: 'USD',
  organizerId: 'org-1',
  organizerName: 'Organizer',
  status: EventStatus.PUBLISHED,
  category: EventCategory.CONFERENCE,
  ageRestriction: EventAgeRestriction.NONE,
  imageUrl: 'https://images.unsplash.com/photo-1',
  totalTickets: 100,
  soldTickets: 10,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('EventDetailClient sentiment visibility (#1616)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render the JWT-guarded sentiment panel for anonymous visitors', () => {
    useAuth.mockReturnValue({ user: null, isAuthenticated: false, isLoading: false });

    render(<EventDetailClient event={event} />);

    expect(screen.queryByTestId('sentiment-panel')).not.toBeInTheDocument();
    expect(screen.getByText('Test Event')).toBeInTheDocument();
  });

  it('renders the sentiment panel for an authenticated user', () => {
    useAuth.mockReturnValue({
      user: { id: 'u1', email: 'u1@example.com', role: 'attendee' },
      isAuthenticated: true,
      isLoading: false,
    });

    render(<EventDetailClient event={event} />);

    expect(screen.getByTestId('sentiment-panel')).toBeInTheDocument();
  });
});
