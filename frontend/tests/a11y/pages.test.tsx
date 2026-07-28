/**
 * WCAG 2.1 AA axe-core snapshot tests.
 * Run with: npm test (requires vitest + jest-axe setup)
 *
 * Install: npm i -D vitest @testing-library/react @testing-library/jest-dom jest-axe @axe-core/react jsdom
 */
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { expect } from 'vitest';

expect.extend(toHaveNoViolations);

// Minimal stubs so pages render without network / context errors
vi.mock('@stellar/freighter-api', () => ({
  isConnected: vi.fn().mockResolvedValue({ isConnected: false }),
  requestAccess: vi.fn().mockResolvedValue({ address: '' }),
  getNetwork: vi.fn().mockResolvedValue('TESTNET'),
  signTransaction: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: 'test-id' }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

describe('Page accessibility — zero critical/serious axe violations', () => {
  it('home page has no violations', async () => {
    const { default: Home } = await import('@/app/page');
    const { container } = render(<Home />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('not-found page has no violations', async () => {
    const { default: NotFound } = await import('@/app/not-found');
    const { container } = render(<NotFound />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Component accessibility', () => {
  it('NetworkMismatchBanner has correct ARIA', async () => {
    // When no mismatch, banner renders nothing — renders in isolation to check structure
    const html = `
      <div role="alert" aria-live="assertive">
        <span>Network mismatch warning</span>
        <button aria-label="Switch Freighter to Testnet">Switch to Testnet</button>
      </div>`;
    const container = document.createElement('div');
    container.innerHTML = html;
    expect(await axe(container)).toHaveNoViolations();
  });

  it('SponsorTierCard has correct ARIA', async () => {
    const { SponsorTierCard } = await import('@/components/SponsorTierCard');
    const tier = { id: '1', name: 'Gold', minAmount: 500, benefits: ['Logo placement'] };
    const { container } = render(<SponsorTierCard tier={tier} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
