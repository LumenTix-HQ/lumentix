import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const useAuth = vi.fn();
const walletChallenge = vi.fn();
const walletVerify = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuth(),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    walletChallenge: (...a: unknown[]) => walletChallenge(...a),
    walletVerify: (...a: unknown[]) => walletVerify(...a),
  },
}));

// eslint-disable-next-line import/first
import WalletLinkSection from '@/components/WalletLinkSection';

const LINKED_KEY = 'GTESTLINKEDPUBLICKEY';

describe('WalletLinkSection (#1395)', () => {
  const onLinked = vi.fn();
  const onToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    walletChallenge.mockResolvedValue({ nonce: 'nonce-123', accountAddress: LINKED_KEY });
    walletVerify.mockResolvedValue({ walletAddress: LINKED_KEY });
  });

  it('requests a challenge and links the wallet through the cookie-authenticated client', async () => {
    const user = userEvent.setup();
    render(
      <WalletLinkSection linkedAddress={null} onLinked={onLinked} onToast={onToast} />,
    );

    await user.click(screen.getByRole('button', { name: /link freighter wallet/i }));
    await screen.findByText('nonce-123');

    expect(walletChallenge).toHaveBeenCalledWith(expect.any(String));

    await user.click(screen.getByRole('button', { name: /sign with freighter/i }));

    await waitFor(() => expect(onLinked).toHaveBeenCalledWith(LINKED_KEY));
    expect(walletVerify).toHaveBeenCalledWith({
      nonce: 'nonce-123',
      signature: 'signed-message',
      publicKey: expect.any(String),
    });
    expect(onToast).toHaveBeenCalledWith('Wallet linked successfully!', 'success');
  });

  it('blocks linking when not authenticated', async () => {
    useAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    const user = userEvent.setup();
    render(
      <WalletLinkSection linkedAddress={null} onLinked={onLinked} onToast={onToast} />,
    );

    await user.click(screen.getByRole('button', { name: /link freighter wallet/i }));

    expect(walletChallenge).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith(
      'You must be signed in to link a wallet.',
      'error',
    );
  });
});
