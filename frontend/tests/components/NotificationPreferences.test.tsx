import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type {
  NotificationPreferences as NotificationPrefs,
} from '@/types/notification-preference';

const getPrefs = vi.fn();
const savePrefs = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getNotificationPreferences: (...a: unknown[]) => getPrefs(...a),
    saveNotificationPreferences: (...a: unknown[]) => savePrefs(...a),
  },
}));

vi.mock('@/lib/push/push-notifications', () => ({
  isPushSupported: () => true,
  getPermissionState: () => 'granted' as const,
  getExistingSubscription: () => Promise.resolve(null),
  subscribeToPush: () => Promise.resolve({}),
  unsubscribeFromPush: () => Promise.resolve(),
}));

// Render the component under test only after mocks are registered.
// eslint-disable-next-line import/first
import NotificationPreferences from '@/components/NotificationPreferences';

const serverPrefs: NotificationPrefs = {
  channels: {
    push: { eventReminders: true, scheduleChanges: true, paymentConfirmations: true },
    email: { eventReminders: true, scheduleChanges: false, paymentConfirmations: true },
    sms: { eventReminders: false, scheduleChanges: true, paymentConfirmations: false },
    in_app: { eventReminders: true, scheduleChanges: true, paymentConfirmations: true },
  },
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '08:00',
    timezone: 'UTC',
  },
};

describe('NotificationPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    getPrefs.mockResolvedValue(serverPrefs);
    savePrefs.mockResolvedValue(serverPrefs);
  });

  it('loads server-side channel preferences on mount', async () => {
    render(<NotificationPreferences />);
    expect(getPrefs).toHaveBeenCalledTimes(1);

    // Wait for the server values to land before asserting.
    const emailSchedule = await screen.findByRole('checkbox', { name: /schedule changes via email/i });
    expect(emailSchedule).not.toBeChecked();

    const smsReminder = screen.getByRole('checkbox', { name: /event reminders via sms/i });
    expect(smsReminder).not.toBeChecked();
  });

  it('round-trips a channel toggle through the backend', async () => {
    render(<NotificationPreferences />);
    const emailReminder = await screen.findByRole('checkbox', { name: /event reminders via email/i });
    expect(emailReminder).toBeChecked();

    fireEvent.click(emailReminder);

    await waitFor(() =>
      expect(savePrefs).toHaveBeenCalledWith({
        channels: {
          email: { eventReminders: false },
        },
      }),
    );
  });

  it('shows quiet-hours controls and saves them to the backend', async () => {
    render(<NotificationPreferences />);
    const quietToggle = await screen.findByRole('checkbox', { name: /quiet hours/i });

    expect(quietToggle).not.toBeChecked();
    fireEvent.click(quietToggle);

    const start = screen.getByLabelText(/start/i) as HTMLInputElement;
    fireEvent.change(start, { target: { value: '23:30' } });

    fireEvent.click(screen.getByRole('button', { name: /save quiet hours/i }));

    await waitFor(() =>
      expect(savePrefs).toHaveBeenCalledWith(
        expect.objectContaining({
          quietHours: expect.objectContaining({ enabled: true, start: '23:30' }),
        }),
      ),
    );
  });
});