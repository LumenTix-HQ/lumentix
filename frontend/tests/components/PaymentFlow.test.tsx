import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const wallet = {
  isConnected: false,
  networkMismatch: false,
  connectWallet: vi.fn(),
  connect: vi.fn(),
};
vi.mock('@/contexts/WalletContext', () => ({ useWallet: () => wallet }));

const paymentStatus = { value: null as string | null };
vi.mock('@/hooks/usePaymentStatus', () => ({
  default: () => ({ status: paymentStatus.value }),
}));

vi.mock('@/hooks/useWalletBalance', () => ({
  useWalletBalance: () => ({
    balance: 100,
    hasInsufficientFunds: () => false,
    shortfall: () => 0,
    refreshBalance: vi.fn(),
  }),
}));

import PaymentFlow from '@/components/PaymentFlow';

describe('PaymentFlow state machine', () => {
  beforeEach(() => {
    wallet.isConnected = false;
    wallet.networkMismatch = false;
    paymentStatus.value = null;
  });

  it('prompts to connect the wallet when disconnected (idle state)', () => {
    render(<PaymentFlow eventId="e1" ticketPrice={0} currency="XLM" />);
    expect(screen.getByRole('button', { name: /connect wallet & register/i })).toBeInTheDocument();
  });

  it('shows the confirmed state when the payment status is CONFIRMED', () => {
    paymentStatus.value = 'CONFIRMED';
    render(<PaymentFlow eventId="e1" ticketPrice={0} currency="XLM" />);
    expect(screen.getByText(/payment confirmed/i)).toBeInTheDocument();
    expect(screen.getByText(/download ticket/i)).toBeInTheDocument();
  });

  it('shows the failed state when the payment status is FAILED', () => {
    paymentStatus.value = 'FAILED';
    render(<PaymentFlow eventId="e1" ticketPrice={0} currency="XLM" />);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
