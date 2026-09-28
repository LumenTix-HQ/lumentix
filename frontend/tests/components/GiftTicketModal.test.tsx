import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GiftTicketModal } from '@/components/gifting/GiftTicketModal';

const EVENT_DATE = '2030-06-01T19:00:00.000Z';

function renderModal(overrides: Partial<Parameters<typeof GiftTicketModal>[0]> = {}) {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  const props = {
    ticketId: 'ticket-1',
    eventTitle: 'Stellar Summit',
    eventDate: EVENT_DATE,
    busy: false,
    error: null,
    onSubmit,
    onClose,
    ...overrides,
  };
  render(<GiftTicketModal {...props} />);
  return { onSubmit, onClose, user: userEvent.setup() };
}

describe('GiftTicketModal', () => {
  it('asks for a recipient before it will send', async () => {
    const { user, onSubmit } = renderModal();

    expect(screen.getByRole('alert')).toHaveTextContent(
      "Enter the recipient's user ID",
    );
    expect(screen.getByRole('button', { name: /Wrap and send/ })).toBeDisabled();

    await user.type(screen.getByLabelText('Recipient user ID'), 'user-2');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Wrap and send/ })).toBeEnabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuses to gift a ticket to yourself', async () => {
    const { user } = renderModal({ currentUserId: 'me' });

    await user.type(screen.getByLabelText('Recipient user ID'), 'me');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'You cannot gift a ticket to yourself',
    );
  });

  it('submits the recipient, message, wrap style and delivery date', async () => {
    const { user, onSubmit } = renderModal();

    await user.type(screen.getByLabelText('Recipient user ID'), 'user-2');
    await user.type(screen.getByLabelText('Gift message'), 'See you there!');
    await user.click(screen.getByRole('button', { name: 'Birthday' }));

    const future = new Date(Date.now() + 86_400_000);
    const stamp = future.toISOString().slice(0, 16);
    await user.type(screen.getByLabelText('Deliver later'), stamp);

    await user.click(screen.getByRole('button', { name: /Wrap and send/ }));

    expect(onSubmit).toHaveBeenCalledWith({
      recipientId: 'user-2',
      message: 'See you there!',
      wrapStyle: 'birthday',
      scheduledFor: stamp,
    });
  });

  it('delivers immediately when no date is chosen', async () => {
    const { user, onSubmit } = renderModal();

    await user.type(screen.getByLabelText('Recipient user ID'), 'user-2');
    await user.click(screen.getByRole('button', { name: /Wrap and send/ }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledFor: undefined }),
    );
  });

  it('rejects a delivery date after the event has started', async () => {
    const { user } = renderModal({ eventDate: new Date(Date.now() + 1000).toISOString() });

    await user.type(screen.getByLabelText('Recipient user ID'), 'user-2');
    const afterEvent = new Date(Date.now() + 7_200_000);
    await user.type(
      screen.getByLabelText('Deliver later'),
      afterEvent.toISOString().slice(0, 16),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      /before the event starts/i,
    );
  });

  it('rejects a delivery date in the past', async () => {
    const { user } = renderModal();

    await user.type(screen.getByLabelText('Recipient user ID'), 'user-2');
    const past = new Date(Date.now() - 7_200_000);
    await user.type(
      screen.getByLabelText('Deliver later'),
      past.toISOString().slice(0, 16),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/in the future/i);
  });

  it('offers all five wrap styles', () => {
    renderModal();

    for (const label of ['Classic', 'Confetti', 'Fireworks', 'Envelope', 'Birthday']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Classic' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('caps the message at the backend limit', () => {
    renderModal();

    expect(screen.getByLabelText('Gift message')).toHaveAttribute(
      'maxlength',
      '500',
    );
  });

  it('shows an error from the server', () => {
    renderModal({ error: 'Ticket already has a gift in flight' });

    // The client-side validation message is also an alert, so match on text.
    expect(
      screen.getByText('Ticket already has a gift in flight'),
    ).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const { user, onClose } = renderModal();

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });

  it('does not close while the request is in flight', async () => {
    const { onClose } = renderModal({ busy: true });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Wrapping/ })).toBeDisabled();
  });
});
