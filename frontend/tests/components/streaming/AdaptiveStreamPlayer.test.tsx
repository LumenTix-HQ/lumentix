import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AdaptiveStreamPlayer } from '@/components/streaming/AdaptiveStreamPlayer';

const mock = vi.hoisted(() => ({ instance: null as any, supported: true }));
vi.mock('hls.js', () => ({ default: class {
  static isSupported = () => mock.supported;
  static Events = { MANIFEST_PARSED: 'manifest', FRAG_LOADED: 'fragment', ERROR: 'error' };
  levels = [{ height: 480, bitrate: 1000000 }, { height: 720, bitrate: 2500000 }];
  bandwidthEstimate = 3000000;
  currentLevel = -1;
  listeners: Record<string, (...args: any[]) => void> = {};
  destroy = vi.fn(); loadSource = vi.fn(); attachMedia = vi.fn();
  on(name: string, callback: (...args: any[]) => void) { this.listeners[name] = callback; }
  constructor() { mock.instance = this; }
} }));

beforeEach(() => { mock.supported = true; vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('AdaptiveStreamPlayer', () => {
  it('loads HLS, exposes manifest quality choices, restores auto mode and disposes the player', async () => {
    const { unmount } = render(<AdaptiveStreamPlayer eventId="event" src="https://example.com/master.m3u8" />);
    const player = mock.instance;
    expect(player.loadSource).toHaveBeenCalledWith('https://example.com/master.m3u8');
    const { act } = await import('@testing-library/react');
    act(() => player.listeners.manifest());
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } });
    expect(player.currentLevel).toBe(1);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '-1' } });
    expect(player.currentLevel).toBe(-1);
    unmount(); expect(player.destroy).toHaveBeenCalledOnce();
  });
  it('uses native automatic playback when MSE is unavailable', () => {
    mock.supported = false;
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
    render(<AdaptiveStreamPlayer eventId="event" src="https://example.com/master.m3u8" />);
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByText(/browser adjusts quality automatically/)).toBeInTheDocument();
  });
});
