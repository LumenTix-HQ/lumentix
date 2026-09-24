import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { EventSentiment } from '@/types/review';

const getEventSentiment = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getEventSentiment: (...a: unknown[]) => getEventSentiment(...a),
  },
}));

// eslint-disable-next-line import/first
import { SentimentPanel } from '@/components/reviews/SentimentPanel';

const sentiment: EventSentiment = {
  eventId: 'evt-1',
  reviewsAnalysed: 6,
  aggregateScore: 0.62,
  averageRating: 4.2,
  distribution: { positive: 5, negative: 1, neutral: 0, mixed: 0 },
  commonPraise: [{ theme: 'speakers', mentions: 4, score: 0.8 }],
  commonComplaints: [{ theme: 'queues', mentions: 1, score: -0.4 }],
  summary: 'Attendees loved the speakers and found the event well organised.',
};

describe('SentimentPanel (#1159)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fetch when no event id is provided', () => {
    render(<SentimentPanel eventId="" />);
    expect(getEventSentiment).not.toHaveBeenCalled();
  });

  it('calls the backend endpoint for the given event', async () => {
    getEventSentiment.mockResolvedValue(sentiment);
    render(<SentimentPanel eventId="evt-1" />);
    await waitFor(() => expect(getEventSentiment).toHaveBeenCalledWith('evt-1'));
  });

  it('renders the aggregate sentiment, summary and themes on success', async () => {
    getEventSentiment.mockResolvedValue(sentiment);
    render(<SentimentPanel eventId="evt-1" />);

    expect(await screen.findByText(/positive/)).toBeInTheDocument();
    expect(screen.getByText(/6 reviews/i)).toBeInTheDocument();
    expect(screen.getByText(sentiment.summary)).toBeInTheDocument();
    expect(screen.getAllByText((_, node) => node?.textContent === 'speakers(4)').length).toBeGreaterThan(0);
    expect(screen.getAllByText((_, node) => node?.textContent === 'queues(1)').length).toBeGreaterThan(0);
  });

  it('renders an empty state when no reviews have been analysed', async () => {
    getEventSentiment.mockResolvedValue({ ...sentiment, reviewsAnalysed: 0, aggregateScore: 0 });
    render(<SentimentPanel eventId="evt-1" />);

    expect(await screen.findByText(/no reviews have been analysed/i)).toBeInTheDocument();
  });

  it('renders an error state when the endpoint fails', async () => {
    getEventSentiment.mockRejectedValue(new Error('Event not found'));
    render(<SentimentPanel eventId="evt-1" />);

    expect(await screen.findByText(/event not found/i)).toBeInTheDocument();
  });
});