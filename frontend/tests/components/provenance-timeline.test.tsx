import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderProvenanceTimeline } from '@/components/TicketCard';

interface ProvenanceTransfer {
  sequence: number;
  fromUserId: string;
  toUserId: string;
  fromPublicKey: string | null;
  toPublicKey: string | null;
  transactionHash: string | null;
  timestamp: string;
}

const transfers: ProvenanceTransfer[] = [
  {
    sequence: 1,
    fromUserId: 'origin',
    toUserId: 'buyer-a',
    fromPublicKey: null,
    toPublicKey: 'GC4...',
    transactionHash: 'abc123',
    timestamp: '2025-02-01T00:00:00Z',
  },
  {
    sequence: 2,
    fromUserId: 'buyer-a',
    toUserId: 'buyer-b',
    fromPublicKey: 'GC4...',
    toPublicKey: 'GD7...',
    transactionHash: null,
    timestamp: '2025-03-15T00:00:00Z',
  },
];

describe('renderProvenanceTimeline', () => {
  it('shows the original-issue message when there are no transfers', () => {
    render(<div>{renderProvenanceTimeline([])}</div>);
    expect(screen.getByText('Original issue. No secondary transfers recorded.')).toBeTruthy();
  });

  it('renders each transfer with both parties', () => {
    render(<div>{renderProvenanceTimeline(transfers)}</div>);
    expect(screen.getByText(/origin to buyer-a/)).toBeTruthy();
    expect(screen.getByText(/buyer-a to buyer-b/)).toBeTruthy();
    expect(screen.getByText('Stellar transaction: abc123')).toBeTruthy();
  });

  it('pluralizes the transfer count', () => {
    const single = render(<div>{renderProvenanceTimeline([transfers[0]])}</div>);
    expect(screen.getByText('(1 transfer)')).toBeTruthy();
    // Unmount before the second render so the two trees cannot match ambiguously.
    single.unmount();

    render(<div>{renderProvenanceTimeline(transfers)}</div>);
    expect(screen.getByText('(2 transfers)')).toBeTruthy();
  });
});