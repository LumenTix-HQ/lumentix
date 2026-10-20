import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const giftTicket = vi.fn();
const cancelGift = vi.fn();
const unwrapGift = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    giftTicket: (...a: unknown[]) => giftTicket(...a),
    cancelGift: (...a: unknown[]) => cancelGift(...a),
    unwrapGift: (...a: unknown[]) => unwrapGift(...a),
  },
}));

// eslint-disable-next-line import/first
import { useTicketGifting } from '@/hooks/useTicketGifting';
import type { UnwrapAnimation } from '@/types/gifting';

const TARGET = { ticketId: 'ticket-1', eventTitle: 'Stellar Summit' };

const REVEAL: UnwrapAnimation = {
  giftId: 'gift-1',
  wrapStyle: 'birthday',
  message: 'Happy birthday!',
  senderId: 'user-1',
  ticketId: 'ticket-1',
  eventId: 'event-1',
  eventTitle: 'Stellar Summit',
  frames: [{ step: 'candles-light', durationMs: 700 }],
  totalDurationMs: 700,
  firstUnwrap: true,
};

function setup() {
  return renderHook(() => useTicketGifting());
}

describe('useTicketGifting (#1244)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    giftTicket.mockResolvedValue({
      giftId: 'gift-1',
      ticketId: 'ticket-1',
      status: 'delivered',
      wrapStyle: 'classic',
      message: null,
      scheduledFor: null,
      deliveredAt: '2030-06-01T19:00:00.000Z',
    });
    cancelGift.mockResolvedValue({ status: 'cancelled' });
    unwrapGift.mockResolvedValue(REVEAL);
  });

  describe('composing', () => {
    it('starts with nothing open', () => {
      const { result } = setup();

      expect(result.current.giftTarget).toBeNull();
      expect(result.current.reveal).toBeNull();
      expect(result.current.isBusy).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.success).toBeNull();
    });

    it('opens and closes the composer for a ticket', () => {
      const { result } = setup();

      act(() => result.current.openGift(TARGET));
      expect(result.current.giftTarget).toEqual(TARGET);

      act(() => result.current.closeGift());
      expect(result.current.giftTarget).toBeNull();
    });

    it('will not close the composer while a send is in flight', async () => {
      let release!: (v: unknown) => void;
      giftTicket.mockReturnValue(
        new Promise((resolve) => {
          release = resolve;
        }),
      );
      const { result } = setup();

      act(() => result.current.openGift(TARGET));

      let pending!: Promise<void>;
      act(() => {
        pending = result.current.submitGift({ recipientId: 'user-2', message: '', wrapStyle: 'classic' });
      });
      expect(result.current.isBusy).toBe(true);

      act(() => result.current.closeGift());
      expect(result.current.giftTarget).toEqual(TARGET);

      await act(async () => {
        release(null);
        await pending;
      });
      expect(result.current.giftTarget).toBeNull();
    });

    it('clears a stale success message when a new gift is opened', async () => {
      const { result } = setup();

      act(() => result.current.openGift(TARGET));
      await act(async () => {
        await result.current.submitGift({ recipientId: 'user-2', message: '', wrapStyle: 'classic' });
      });
      expect(result.current.success).toBeTruthy();

      act(() => result.current.openGift({ ticketId: 'ticket-2', eventTitle: 'Other' }));

      expect(result.current.success).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.giftTarget).toEqual({ ticketId: 'ticket-2', eventTitle: 'Other' });
    });
  });

  describe('submitting a gift', () => {
    it('does nothing when no ticket is being gifted', async () => {
      const { result } = setup();

      await act(async () => {
        await result.current.submitGift({ recipientId: 'user-2', message: '', wrapStyle: 'classic' });
      });

      expect(giftTicket).not.toHaveBeenCalled();
    });

    it('sends the recipient and wrap style, and closes the composer', async () => {
      const { result } = setup();

      act(() => result.current.openGift(TARGET));
      await act(async () => {
        await result.current.submitGift({
          recipientId: 'user-2',
          message: 'See you there!',
          wrapStyle: 'confetti',
        });
      });

      expect(giftTicket).toHaveBeenCalledWith('ticket-1', {
        recipientId: 'user-2',
        message: 'See you there!',
        wrapStyle: 'confetti',
        scheduledFor: undefined,
      });
      expect(result.current.giftTarget).toBeNull();
      expect(result.current.success).toBe('Gift sent. Your recipient can unwrap it now.');
      expect(result.current.isBusy).toBe(false);
    });

    it('omits an empty message instead of sending an empty string', async () => {
      const { result } = setup();

      act(() => result.current.openGift(TARGET));
      await act(async () => {
        await result.current.submitGift({ recipientId: 'user-2', message: '   ', wrapStyle: 'classic' });
      });

      expect(giftTicket).toHaveBeenCalledWith('ticket-1', expect.objectContaining({ message: undefined }));
    });

    it('reports the delivery time for a scheduled gift', async () => {
      const scheduledFor = '2030-06-01T19:00:00.000Z';
      giftTicket.mockResolvedValue({
        giftId: 'gift-2',
        ticketId: 'ticket-1',
        status: 'scheduled',
        wrapStyle: 'birthday',
        message: 'Happy birthday!',
        scheduledFor,
        deliveredAt: null,
      });
      const { result } = setup();

      act(() => result.current.openGift(TARGET));
      await act(async () => {
        await result.current.submitGift({
          recipientId: 'user-2',
          message: 'Happy birthday!',
          wrapStyle: 'birthday',
          scheduledFor,
        });
      });

      expect(result.current.success).toContain('Gift scheduled');
      expect(result.current.success).toContain(new Date(scheduledFor).toLocaleString());
    });

    it('keeps the composer open and surfaces the error when the send fails', async () => {
      giftTicket.mockRejectedValue(new Error('Ticket already has a gift in flight'));
      const { result } = setup();

      act(() => result.current.openGift(TARGET));
      await act(async () => {
        await result.current.submitGift({ recipientId: 'user-2', message: '', wrapStyle: 'classic' });
      });

      expect(result.current.error).toBe('Ticket already has a gift in flight');
      expect(result.current.giftTarget).toEqual(TARGET);
      expect(result.current.isBusy).toBe(false);
    });

    it('falls back to a generic message when the failure is not an Error', async () => {
      giftTicket.mockRejectedValue('nope');
      const { result } = setup();

      act(() => result.current.openGift(TARGET));
      await act(async () => {
        await result.current.submitGift({ recipientId: 'user-2', message: '', wrapStyle: 'classic' });
      });

      expect(result.current.error).toBe('Failed to send the gift.');
    });

    it('clears a previous failure so a retry starts clean', async () => {
      giftTicket.mockRejectedValueOnce(new Error('Network down'));
      const { result } = setup();

      act(() => result.current.openGift(TARGET));
      await act(async () => {
        await result.current.submitGift({ recipientId: 'user-2', message: '', wrapStyle: 'classic' });
      });
      expect(result.current.error).toBe('Network down');

      await act(async () => {
        await result.current.submitGift({ recipientId: 'user-2', message: '', wrapStyle: 'classic' });
      });

      expect(result.current.error).toBeNull();
      expect(result.current.success).toBe('Gift sent. Your recipient can unwrap it now.');
    });
  });

  describe('cancelling a gift', () => {
    it('confirms the cancellation', async () => {
      const { result } = setup();

      await act(async () => {
        await result.current.cancelGift('gift-1');
      });

      expect(cancelGift).toHaveBeenCalledWith('gift-1');
      expect(result.current.success).toBe('Gift cancelled. The ticket is still yours.');
      expect(result.current.isBusy).toBe(false);
    });

    it('surfaces a cancellation failure', async () => {
      cancelGift.mockRejectedValue(new Error('Gift already delivered'));
      const { result } = setup();

      await act(async () => {
        await result.current.cancelGift('gift-1');
      });

      expect(result.current.error).toBe('Gift already delivered');
      expect(result.current.success).toBeNull();
    });
  });

  describe('revealing a gift', () => {
    it('stores the reveal returned by the backend', async () => {
      const { result } = setup();

      await act(async () => {
        await result.current.playReveal('gift-1');
      });

      expect(unwrapGift).toHaveBeenCalledWith('gift-1');
      expect(result.current.reveal).toEqual(REVEAL);
      expect(result.current.isBusy).toBe(false);
    });

    it('reports a failed unwrap without opening the reveal', async () => {
      unwrapGift.mockRejectedValue(new Error('Not your gift'));
      const { result } = setup();

      await act(async () => {
        await result.current.playReveal('gift-1');
      });

      expect(result.current.error).toBe('Not your gift');
      expect(result.current.reveal).toBeNull();
    });

    it('falls back to a generic message when the unwrap failure is not an Error', async () => {
      unwrapGift.mockRejectedValue({});
      const { result } = setup();

      await act(async () => {
        await result.current.playReveal('gift-1');
      });

      expect(result.current.error).toBe('Failed to open the gift.');
    });

    it('closes the reveal', async () => {
      const { result } = setup();

      await act(async () => {
        await result.current.playReveal('gift-1');
      });
      act(() => result.current.closeReveal());

      expect(result.current.reveal).toBeNull();
    });
  });

  it('dismisses both the error and the success message', async () => {
    unwrapGift.mockRejectedValue(new Error('Not your gift'));
    const { result } = setup();

    await act(async () => {
      await result.current.playReveal('gift-1');
    });
    expect(result.current.error).toBe('Not your gift');

    act(() => result.current.dismissMessages());

    expect(result.current.error).toBeNull();
    expect(result.current.success).toBeNull();
  });
});
