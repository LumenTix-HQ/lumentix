import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const precacheEventData = vi.fn();
const eventDataUrls = vi.fn((ids: string[], _base = '') => [
  '/api/events',
  ...ids.map((id) => `/api/events/${id}`),
]);

vi.mock('@/lib/pwa/offline-events', () => ({
  precacheEventData: (...a: unknown[]) => precacheEventData(...a),
  eventDataUrls: (...a: unknown[]) => eventDataUrls(...a),
}));

vi.mock('@/components/events/EventCard', () => ({
  default: ({ event }: { event: { id: string; title: string } }) => (
    <div data-testid={`event-${event.id}`}>{event.title}</div>
  ),
}));
vi.mock('@/components/events/EventCardSkeleton', () => ({
  default: () => <div data-testid="skeleton" />,
}));
vi.mock('@/components/events/SearchBar', () => ({
  default: () => <div>search</div>,
}));
vi.mock('@/components/events/FilterPanel', () => ({
  default: () => <div>filters</div>,
}));
vi.mock('@/components/events/ErrorState', () => ({
  default: ({ message }: { message: string }) => <div data-testid="error">{message}</div>,
}));
vi.mock('@/components/events/EmptyState', () => ({
  default: () => <div data-testid="empty">empty</div>,
}));

// eslint-disable-next-line import/first
import EventsPage from '@/app/events/page';

const events = [
  { id: 'evt-1', title: 'Hackathon' },
  { id: 'evt-2', title: 'Concert' },
];

class FakeIntersectionObserver {
  callback: IntersectionObserverCallback;
  constructor(cb: IntersectionObserverCallback) {
    this.callback = cb;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  root = null;
  rootMargin = '';
  thresholds = [];
  takeRecords() {
    return [];
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver;
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(events),
  });
  precacheEventData.mockResolvedValue({ cached: events.length, failed: 0 });
});

describe('EventsPage PWA precaching (#1162)', () => {
  it('imports and calls the precache-utility module it is wired to', async () => {
    // Guards against a regression to the pre-issue state where the events
    // page fetched events but never referenced the precaching utilities.
    expect(typeof precacheEventData).toBe('function');
    expect(typeof eventDataUrls).toBe('function');
  });

  it('triggers precacheEventData for the event ids it renders', async () => {
    render(<EventsPage />);
    expect(await screen.findByTestId('event-evt-1')).toBeInTheDocument();
    expect(screen.getByTestId('event-evt-2')).toBeInTheDocument();

    await waitFor(() => expect(precacheEventData).toHaveBeenCalled());
    // The URL set handed to the worker must include the listing endpoint plus
    // a detail URL per event on screen.
    expect(eventDataUrls).toHaveBeenCalledWith(['evt-1', 'evt-2']);
    expect(precacheEventData).toHaveBeenCalledWith([
      '/api/events',
      '/api/events/evt-1',
      '/api/events/evt-2',
    ]);
  });
});