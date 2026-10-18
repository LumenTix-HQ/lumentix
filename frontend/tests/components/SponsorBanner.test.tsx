import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const useSponsorBanners = vi.fn();

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} />
  ),
}));

vi.mock('@/hooks/useSponsorBanners', () => ({
  useSponsorBanners: (...a: unknown[]) => useSponsorBanners(...a),
}));

// eslint-disable-next-line import/first
import { SponsorBanner } from '@/components/SponsorBanner';

const banner = {
  id: 'sp-1',
  displayName: 'Stellar Co',
  logoUrl: 'https://cdn.example.com/logo.png',
  websiteUrl: 'https://example.com',
};

const baseHook = (overrides: Partial<ReturnType<typeof useSponsorBanners>> = {}) => ({
  banners: [banner],
  loading: false,
  error: null,
  recordImpression: vi.fn(),
  recordClick: vi.fn(),
  ...overrides,
});

describe('SponsorBanner (#1169)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSponsorBanners.mockReturnValue(baseHook());
  });

  it('renders the sponsor logo via next/image', () => {
    render(<SponsorBanner eventId="evt-1" />);
    const img = screen.getByRole('img', { name: /stellar co/i });
    expect(img).toBeInTheDocument();
    // next/image is used (mock renders a plain img in tests); the rendered
    // element carries the optimization-attuned props a raw <img> would not.
    expect(img.getAttribute('src')).toBe('https://cdn.example.com/logo.png');
    expect(img.getAttribute('width')).toBe('40');
    expect(img.getAttribute('height')).toBe('40');
    expect(img.getAttribute('sizes')).toBe('40px');
  });

  it('does not render a broken-image icon when logoUrl is missing', () => {
    useSponsorBanners.mockReturnValue(baseHook({ banners: [{ ...banner, logoUrl: null }] }));
    render(<SponsorBanner eventId="evt-1" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText(/sponsored by/i)).toBeInTheDocument();
  });

  it('falls back to a placeholder when the logo fails to load', () => {
    render(<SponsorBanner eventId="evt-1" />);
    const img = screen.getByRole('img', { name: /stellar co/i });
    fireEvent.error(img);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('★')).toBeInTheDocument();
  });
});

describe('SponsorBanner rotation and impression tracking (#1437)', () => {
  const second = { id: 'sp-2', displayName: 'Orbit Labs', logoUrl: null, websiteUrl: null };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('records one impression per sponsor per page view, even after rotating back', () => {
    const hook = baseHook({ banners: [banner, second] });
    useSponsorBanners.mockReturnValue(hook);
    render(<SponsorBanner eventId="evt-1" />);

    // Step one rotation at a time so each shown banner actually renders.
    for (let i = 0; i < 4; i++) {
      act(() => vi.advanceTimersByTime(8000));
    }

    expect(hook.recordImpression).toHaveBeenCalledTimes(2);
    expect(hook.recordImpression).toHaveBeenCalledWith('sp-1');
    expect(hook.recordImpression).toHaveBeenCalledWith('sp-2');
  });

  it('defers the impression while the tab is hidden', () => {
    const hook = baseHook();
    useSponsorBanners.mockReturnValue(hook);
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

    render(<SponsorBanner eventId="evt-1" />);
    expect(hook.recordImpression).not.toHaveBeenCalled();

    visibility.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(hook.recordImpression).toHaveBeenCalledTimes(1);
    visibility.mockRestore();
  });

  it('records a click-through on the sponsor link', () => {
    const hook = baseHook();
    useSponsorBanners.mockReturnValue(hook);
    render(<SponsorBanner eventId="evt-1" />);

    fireEvent.click(screen.getByRole('link', { name: /sponsored by stellar co/i }));
    expect(hook.recordClick).toHaveBeenCalledWith('sp-1');
  });

  it('does not render a link when the sponsor has no website', () => {
    useSponsorBanners.mockReturnValue(baseHook({ banners: [second] }));
    render(<SponsorBanner eventId="evt-1" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Orbit Labs')).toBeInTheDocument();
  });

  it('pauses rotation when the viewer presses pause', () => {
    useSponsorBanners.mockReturnValue(baseHook({ banners: [banner, second] }));
    render(<SponsorBanner eventId="evt-1" />);

    fireEvent.click(screen.getByRole('button', { name: /pause sponsor rotation/i }));
    // Moving focus away must not resume a rotation the viewer paused.
    fireEvent.blur(screen.getByRole('button', { name: /resume sponsor rotation/i }));
    act(() => vi.advanceTimersByTime(8000 * 2));

    expect(screen.getByText('Stellar Co')).toBeInTheDocument();
  });

  it('pauses rotation while hovered and resumes afterwards', () => {
    useSponsorBanners.mockReturnValue(baseHook({ banners: [banner, second] }));
    render(<SponsorBanner eventId="evt-1" />);
    const region = screen.getByRole('region', { name: 'Sponsors' });

    fireEvent.mouseEnter(region);
    act(() => vi.advanceTimersByTime(8000 * 2));
    expect(screen.getByText('Stellar Co')).toBeInTheDocument();

    fireEvent.mouseLeave(region);
    act(() => vi.advanceTimersByTime(8000));
    expect(screen.getByText('Orbit Labs')).toBeInTheDocument();
  });

  it('does not auto-rotate when the viewer prefers reduced motion', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    );
    useSponsorBanners.mockReturnValue(baseHook({ banners: [banner, second] }));
    render(<SponsorBanner eventId="evt-1" />);

    act(() => vi.advanceTimersByTime(8000 * 3));

    expect(screen.getByText('Stellar Co')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pause/i })).not.toBeInTheDocument();
  });
});
