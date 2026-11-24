import { describe, it, expect, vi, afterEach } from 'vitest';
import { announceCartUpdate, injectAriaLabels, validateA11yCompliance } from '@/lib/a11y';
import { VipTierName, type Seat, type VipTier } from '@/types/event';

const seat = (overrides: Partial<Seat> = {}): Seat => ({
  id: 's1',
  sectionId: 'sec',
  seatIdentifier: 'C7',
  row: 3,
  number: 7,
  status: 'available',
  heldBy: null,
  ...overrides,
});

const tier: VipTier = {
  id: 't1',
  eventId: 'e1',
  name: VipTierName.GOLD,
  price: 100,
  maxSlots: 10,
  filledSlots: 4,
  benefits: [],
  createdAt: '',
};

function fixture(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

describe('a11y helpers (#1434)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('injectAriaLabels', () => {
    it('describes seat identity, state and pricing details', () => {
      expect(injectAriaLabels.seat(seat(), false)).toBe('Seat C7, available');
      expect(injectAriaLabels.seat(seat({ status: 'held' }), false)).toBe('Seat C7, held, unavailable');
      expect(
        injectAriaLabels.seat(seat({ price: 1200, pricingTier: 'VIP', obstructedView: true }), true),
      ).toBe('Seat C7, selected, VIP, 1,200 XLM, obstructed view');
    });

    it('describes tier price and availability', () => {
      expect(injectAriaLabels.tier(tier, false, false, '100 XLM')).toBe('gold tier, 100 XLM, 6 remaining');
      expect(injectAriaLabels.tier(tier, true, false)).toBe('gold tier, selected');
      expect(injectAriaLabels.tier(tier, false, true, '100 XLM')).toBe('gold tier, 100 XLM, sold out');
    });
  });

  describe('announceCartUpdate', () => {
    it('writes the message to a single polite live region', () => {
      vi.useFakeTimers();
      announceCartUpdate('Seat C7 selected');
      announceCartUpdate('Seat C8 selected');
      vi.runAllTimers();

      const regions = document.querySelectorAll('[aria-live="polite"]');
      expect(regions).toHaveLength(1);
      expect(regions[0]).toHaveAttribute('role', 'status');
      expect(regions[0]).toHaveTextContent('Seat C8 selected');
    });
  });

  describe('validateA11yCompliance', () => {
    it('passes an accessible fragment', () => {
      const root = fixture(`
        <button>Buy</button>
        <div role="button" tabindex="0" aria-label="Seat A1"></div>
        <label>Qty <input type="number" /></label>
        <img src="x.png" alt="Logo" />
      `);
      expect(validateA11yCompliance(root)).toEqual([]);
    });

    it('flags unnamed controls, unfocusable widgets, unlabelled inputs and missing alt text', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const root = fixture(`
        <button></button>
        <div role="button" aria-label="Seat A1"></div>
        <input type="text" />
        <img src="x.png" />
      `);
      const issues = validateA11yCompliance(root);
      expect(issues).toHaveLength(4);
      expect(issues.join('\n')).toMatch(/without an accessible name/);
      expect(issues.join('\n')).toMatch(/not keyboard focusable/);
      expect(issues.join('\n')).toMatch(/Form control without a label/);
      expect(issues.join('\n')).toMatch(/Image without alt text/);
    });

    it('flags interactive content hidden inside role="img"', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const root = fixture(`
        <svg role="img" aria-label="Seat map"><g role="button" tabindex="0" aria-label="Seat A1"></g></svg>
      `);
      expect(validateA11yCompliance(root)).toEqual([
        expect.stringMatching(/inside role="img"/),
      ]);
    });

    it('accepts inputs labelled via label[for]', () => {
      const root = fixture(`<label for="email">Email</label><input id="email" type="email" />`);
      expect(validateA11yCompliance(root)).toEqual([]);
    });
  });
});
