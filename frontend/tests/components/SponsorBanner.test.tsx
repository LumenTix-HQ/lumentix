import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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