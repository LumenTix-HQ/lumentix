import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { GiftUnwrapAnimation } from '@/components/gifting/GiftUnwrapAnimation';
import type { UnwrapAnimation } from '@/types/gifting';

/** The birthday reveal as `GiftingService.FRAMES` defines it. */
const REVEAL: UnwrapAnimation = {
  giftId: 'gift-1',
  wrapStyle: 'birthday',
  message: 'Happy birthday!',
  senderId: 'user-1',
  ticketId: 'ticket-1',
  eventId: 'event-1',
  eventTitle: 'Stellar Summit',
  frames: [
    { step: 'candles-light', durationMs: 700 },
    { step: 'candles-blow', durationMs: 800 },
    { step: 'box-open', durationMs: 600 },
    { step: 'message-reveal', durationMs: 900 },
  ],
  totalDurationMs: 3000,
  firstUnwrap: true,
};

function renderAnimation(overrides: Partial<UnwrapAnimation> = {}, onDone = vi.fn()) {
  render(<GiftUnwrapAnimation reveal={{ ...REVEAL, ...overrides }} onDone={onDone} />);
  return { onDone };
}

/** Runs the timers for the current frame, plus the React work it triggers. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function progressBar(): HTMLElement {
  const dialog = screen.getByRole('dialog', { name: 'Gift reveal' });
  const bar = dialog.querySelector('.bg-indigo-400');
  if (!bar) throw new Error('progress bar not found');
  return bar as HTMLElement;
}

describe('GiftUnwrapAnimation (#1244)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens a modal dialog for the reveal', () => {
    renderAnimation();

    const dialog = screen.getByRole('dialog', { name: 'Gift reveal' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Stellar Summit · ticket ticket-1')).toBeInTheDocument();
  });

  it('falls back to a generic event name when the backend has no title', () => {
    renderAnimation({ eventTitle: null });

    expect(screen.getByText(/Your event/)).toBeInTheDocument();
  });

  it('steps through the frames the backend asked for', async () => {
    const { onDone } = renderAnimation();

    expect(screen.getByText('Lighting the candles…')).toBeInTheDocument();

    await advance(700);
    expect(screen.getByText('Blowing out the candles…')).toBeInTheDocument();

    await advance(800);
    expect(screen.getByText('Opening the box…')).toBeInTheDocument();

    await advance(600);
    expect(screen.getByText('Unwrapping your message…')).toBeInTheDocument();

    expect(onDone).not.toHaveBeenCalled();
  });

  it('honours each frame duration rather than one fixed delay', async () => {
    renderAnimation();

    await advance(699);
    expect(screen.getByText('Lighting the candles…')).toBeInTheDocument();

    await advance(1);
    expect(screen.getByText('Blowing out the candles…')).toBeInTheDocument();
  });

  it('announces each step politely for assistive tech', () => {
    renderAnimation();

    expect(screen.getByText('Lighting the candles…')).toHaveAttribute('aria-live', 'polite');
  });

  it('finishes and hands control back once the last frame elapses', async () => {
    const { onDone } = renderAnimation();

    await advance(700);
    await advance(800);
    await advance(600);
    await advance(900);

    expect(onDone).toHaveBeenCalled();
  });

  it('keeps the message on screen in the finished state', async () => {
    renderAnimation();

    await advance(700);
    await advance(800);
    await advance(600);

    expect(screen.getByTestId('gift-message')).toHaveTextContent('Happy birthday!');

    await advance(900);

    expect(screen.getByTestId('gift-message')).toBeInTheDocument();
  });

  it('uses a placeholder when the sender left no message', async () => {
    renderAnimation({ message: null, frames: [{ step: 'message-reveal', durationMs: 10 }] });

    await advance(10);

    expect(screen.getByTestId('gift-message')).toHaveTextContent('No message');
  });

  it('advances the progress bar as frames complete', async () => {
    renderAnimation({ frames: [{ step: 'box-open', durationMs: 100 }, { step: 'message-reveal', durationMs: 100 }] });

    expect(progressBar()).toHaveStyle({ width: '50%' });

    await advance(100);

    expect(progressBar()).toHaveStyle({ width: '100%' });
  });

  it('always offers a Skip control that ends the animation early', () => {
    const { onDone } = renderAnimation();

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('renames the control to Close once the sequence is over', async () => {
    renderAnimation();

    await advance(700);
    await advance(800);
    await advance(600);
    await advance(900);

    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
  });

  it('does not play again when the gift was already unwrapped once', () => {
    renderAnimation({ firstUnwrap: false });

    expect(screen.getByText('You have already unwrapped this gift.')).toBeInTheDocument();
  });

  it('says nothing about a repeat unwrap on the first reveal', () => {
    renderAnimation();

    expect(screen.queryByText(/already unwrapped/)).not.toBeInTheDocument();
  });

  it('finishes immediately when the backend returns no frames', () => {
    const { onDone } = renderAnimation({ frames: [] });

    expect(onDone).toHaveBeenCalled();
  });

  it('labels an unknown step rather than showing a blank line', () => {
    renderAnimation({ frames: [{ step: 'teleport', durationMs: 100 }] });

    expect(screen.getByText('Unwrapping your gift…')).toBeInTheDocument();
  });
});
