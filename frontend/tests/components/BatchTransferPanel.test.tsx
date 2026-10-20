import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BatchTransferPanel from '@/components/BatchTransferPanel';
import type { Ticket } from '@/components/TicketCard';

const batchTransferTickets = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    batchTransferTickets: (...a: unknown[]) => batchTransferTickets(...a),
  },
}));

const tickets: Ticket[] = [
  { id: 't-1', eventTitle: 'Workshop A', eventDate: '2026-10-01T00:00:00Z', status: 'confirmed' },
  { id: 't-2', eventTitle: 'Conference B', eventDate: '2026-11-01T00:00:00Z', status: 'confirmed' },
  { id: 't-3', eventTitle: 'Gala C', eventDate: '2026-12-01T00:00:00Z', status: 'confirmed' },
];

describe('BatchTransferPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    batchTransferTickets.mockResolvedValue({
      success: true,
      transferredCount: 2,
      errors: ['t-3: recipient not found or not entitled'],
    });
  });

  it('selects multiple tickets and transfers each to a different recipient', async () => {
    render(<BatchTransferPanel tickets={tickets} onTransferred={() => {}} />);

    fireEvent.click(screen.getByRole('checkbox', { name: /select workshop a/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /select conference b/i }));

    fireEvent.change(screen.getByRole('textbox', { name: /recipient for workshop a/i }), {
      target: { value: 'recipient-1' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /recipient for conference b/i }), {
      target: { value: 'recipient-2' },
    });

    fireEvent.click(screen.getByRole('button', { name: /transfer 2 tickets/i }));

    await waitFor(() =>
      expect(batchTransferTickets).toHaveBeenCalledWith([
        { ticketId: 't-1', recipientUserId: 'recipient-1' },
        { ticketId: 't-2', recipientUserId: 'recipient-2' },
      ]),
    );
  });

  it('surfaces per-ticket failures from a partially failed batch', async () => {
    render(<BatchTransferPanel tickets={tickets} onTransferred={() => {}} />);

    fireEvent.click(screen.getByRole('checkbox', { name: /select workshop a/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /select gala c/i }));

    fireEvent.change(screen.getByRole('textbox', { name: /recipient for workshop a/i }), {
      target: { value: 'recipient-1' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /recipient for gala c/i }), {
      target: { value: 'recipient-3' },
    });

    fireEvent.click(screen.getByRole('button', { name: /transfer 2 tickets/i }));

    // Workshop A succeeds (transferredCount = 2 covers t-1+t-2 in storage order),
    // Gala C reports the backend error for its ticketId.
    await waitFor(() => expect(screen.getByText(/not found or not entitled/i)).toBeInTheDocument());
    expect(screen.getByText('Transferred')).toBeInTheDocument();
  });

  it('blocks submission when a selected ticket has no recipient', () => {
    render(<BatchTransferPanel tickets={tickets} onTransferred={() => {}} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /select workshop a/i }));
    fireEvent.click(screen.getByRole('button', { name: /transfer 1 ticket/i }));

    expect(screen.getByText(/every selected ticket needs a recipient/i)).toBeInTheDocument();
    expect(batchTransferTickets).not.toHaveBeenCalled();
  });
});