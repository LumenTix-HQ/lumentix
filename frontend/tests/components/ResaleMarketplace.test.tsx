import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type {
  ResaleMarketplaceListing,
  ResaleMarketplaceResponse,
} from '@/types/resale';

const getResaleMarketplace = vi.fn();
const buyResaleTicket = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getResaleMarketplace: (...a: unknown[]) => getResaleMarketplace(...a),
    buyResaleTicket: (...a: unknown[]) => buyResaleTicket(...a),
  },
}));

// eslint-disable-next-line import/first
import ResaleMarketplacePage from '@/app/resale/page';

const listing: ResaleMarketplaceListing = {
  ticketId: '11111111-1111-1111-1111-111111111111',
  eventId: '22222222-2222-2222-2222-222222222222',
  eventTitle: 'Stellar Dev Summit',
  eventDate: '2026-10-01T18:00:00Z',
  askPrice: 50,
  currency: 'XLM',
  sellerDisplayName: 'alice',
  listedAt: '2026-09-01T00:00:00Z',
};

const response: ResaleMarketplaceResponse = {
  data: [listing],
  total: 1,
  page: 1,
  limit: 20,
  totalPages: 1,
};

describe('ResaleMarketplacePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getResaleMarketplace.mockResolvedValue(response);
    buyResaleTicket.mockResolvedValue({
      ticket: { id: listing.ticketId },
      salePrice: 50,
      organizerFee: 2.5,
      sellerPayout: 47.5,
    });
  });

  it('loads and renders marketplace listings', async () => {
    render(<ResaleMarketplacePage />);
    expect(getResaleMarketplace).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Stellar Dev Summit')).toBeInTheDocument();
    expect(screen.getByText(/50 XLM/)).toBeInTheDocument();
  });

  it('shows an empty state when nothing is listed', async () => {
    getResaleMarketplace.mockResolvedValue({ ...response, data: [], total: 0 });
    render(<ResaleMarketplacePage />);
    expect(await screen.findByText(/nothing listed right now/i)).toBeInTheDocument();
  });

  it('purchases a resale ticket with a transaction hash', async () => {
    render(<ResaleMarketplacePage />);
    const buyButton = await screen.findByRole('button', { name: /buy resale ticket/i });
    fireEvent.click(buyButton);

    const hashInput = screen.getByPlaceholderText('abc…');
    fireEvent.change(hashInput, { target: { value: 'deadbeef' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm purchase/i }));

    await waitFor(() =>
      expect(buyResaleTicket).toHaveBeenCalledWith(listing.ticketId, {
        transactionHash: 'deadbeef',
      }),
    );
    expect(await screen.findByText(/purchase confirmed/i)).toBeInTheDocument();
  });

  it('surfaces a fraud-hold outcome distinctly instead of a generic error', async () => {
    const heldError = new Error(
      'Trade held for fraud review (flag 6018f000-0000-0000-0000-000000000000). Reasons: velocity_anomaly.',
    );
    buyResaleTicket.mockRejectedValue(heldError);

    render(<ResaleMarketplacePage />);
    const buyButton = await screen.findByRole('button', { name: /buy resale ticket/i });
    fireEvent.click(buyButton);

    fireEvent.change(screen.getByPlaceholderText('abc…'), { target: { value: 'deadbeef' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm purchase/i }));

    expect(await screen.findByText(/purchase held for review/i)).toBeInTheDocument();
    expect(screen.getByText(/under review/i)).toBeInTheDocument();
  });
});