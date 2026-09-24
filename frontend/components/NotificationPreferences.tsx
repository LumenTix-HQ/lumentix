'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import {
  isPushSupported,
  getPermissionState,
  getExistingSubscription,
  subscribeToPush,
  unsubscribeFromPush,
  type PushPermission,
} from '@/lib/push/push-notifications';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_CATEGORIES,
  type ChannelPreferences,
  type NotificationChannel,
  type NotificationCategory,
  type NotificationPreferences,
  type QuietHours,
} from '@/types/notification-preference';

const PREF_STORAGE_KEY = 'lumentix_notification_prefs';

function defaultChannels(): ChannelPreferences {
  const channels = {} as ChannelPreferences;
  for (const channel of NOTIFICATION_CHANNELS) {
    channels[channel] = {} as ChannelPreferences[NotificationChannel];
    for (const category of NOTIFICATION_CATEGORIES) {
      channels[channel][category] = true;
    }
  }
  return channels;
}

const DEFAULT_PREFS: NotificationPreferences = {
  channels: defaultChannels(),
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '08:00',
    timezone: 'UTC',
  },
};

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  eventReminders: 'Event reminders',
  scheduleChanges: 'Schedule changes',
  paymentConfirmations: 'Payment confirmations',
};

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  push: 'Push',
  email: 'Email',
  sms: 'SMS',
  in_app: 'In-app',
};

function loadLocalPrefs(): NotificationPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(PREF_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    return {
      channels: {
        ...DEFAULT_PREFS.channels,
        ...Object.fromEntries(
          NOTIFICATION_CHANNELS.map((ch) => [
            ch,
            { ...defaultChannels()[ch], ...(parsed.channels?.[ch] ?? {}) },
          ]),
        ),
      },
      quietHours: { ...DEFAULT_PREFS.quietHours, ...(parsed.quietHours ?? {}) },
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function persistLocal(prefs: NotificationPreferences): void {
  try {
    localStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export default function NotificationPreferences() {
  const [permission, setPermission] = useState<PushPermission>('unsupported');
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [quietHours, setQuietHours] = useState<QuietHours>(DEFAULT_PREFS.quietHours);

  // Load server-side preferences once on mount; fall back to localStorage so
  // offline the same checks keep working.
  useEffect(() => {
    const local = loadLocalPrefs();
    setPrefs(local);
    setQuietHours(local.quietHours);
    setPermission(getPermissionState());
    if (isPushSupported()) {
      getExistingSubscription().then((sub) => setSubscribed(!!sub)).catch(() => {});
    }
    apiClient
      .getNotificationPreferences()
      .then((server) => {
        const merged = {
          channels: {
            ...defaultChannels(),
            ...Object.fromEntries(
              NOTIFICATION_CHANNELS.map((ch) => [
                ch,
                { ...defaultChannels()[ch], ...(server.channels?.[ch] ?? {}) },
              ]),
            ),
          },
          quietHours: { ...DEFAULT_PREFS.quietHours, ...(server.quietHours ?? {}) },
        };
        setPrefs(merged);
        setQuietHours(merged.quietHours);
        persistLocal(merged);
      })
      .catch(() => {
        /* offline or unauthenticated — keep local defaults */
      });
  }, []);

  // Persist channel toggles to the backend as they change (best-effort, keeps
  // offline behaviour working too).
  const toggleChannel = useCallback(
    async (channel: NotificationChannel, category: NotificationCategory) => {
      setPrefs((prev) => {
        const next: NotificationPreferences = {
          ...prev,
          channels: {
            ...prev.channels,
            [channel]: {
              ...prev.channels[channel],
              [category]: !prev.channels[channel][category],
            },
          },
        };
        persistLocal(next);
        return next;
      });

      try {
        await apiClient.saveNotificationPreferences({
          channels: {
            [channel]: {
              [category]: !prefs.channels[channel][category],
            },
          },
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save preferences.');
      }
    },
    [prefs],
  );

  async function saveQuietHours() {
    setBusy(true);
    setError(null);
    try {
      await apiClient.saveNotificationPreferences({ quietHours });
      setPrefs((prev) => {
        const next = { ...prev, quietHours };
        persistLocal(next);
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save quiet hours.');
    } finally {
      setBusy(false);
    }
  }

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      await subscribeToPush();
      setSubscribed(true);
      setPermission(getPermissionState());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to enable notifications.');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      await unsubscribeFromPush();
      setSubscribed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disable notifications.');
    } finally {
      setBusy(false);
    }
  }

  const supported = permission !== 'unsupported';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-white font-medium">Push notifications</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {subscribed
              ? 'Enabled on this device.'
              : 'Get event reminders, schedule changes, and payment updates.'}
          </div>
        </div>
        <button
          type="button"
          onClick={subscribed ? disable : enable}
          disabled={busy || permission === 'denied'}
          className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
        >
          {busy ? 'Working…' : subscribed ? 'Disable' : 'Enable'}
        </button>
      </div>

      {permission === 'denied' && (
        <p className="text-xs text-yellow-400">
          Notifications are blocked in your browser settings. Re-enable them there to opt in.
        </p>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Per-channel, per-category preferences — synced with the backend */}
      {supported && (
        <section className="pt-4 border-t border-white/[0.06]">
          <h4 className="text-xs text-gray-500 uppercase tracking-widest mb-3">
            Channels &amp; categories
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500">
                  <th className="py-2 pr-3 font-medium">Notify me about</th>
                  {NOTIFICATION_CHANNELS.map((channel) => (
                    <th key={channel} className="py-2 px-3 font-medium text-center">
                      {CHANNEL_LABELS[channel]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {NOTIFICATION_CATEGORIES.map((category) => (
                  <tr key={category} className="border-t border-white/[0.04]">
                    <td className="py-2.5 pr-3 text-gray-300">{CATEGORY_LABELS[category]}</td>
                    {NOTIFICATION_CHANNELS.map((channel) => (
                      <td key={channel} className="py-2.5 px-3 text-center">
                        <label className="inline-flex">
                          <input
                            type="checkbox"
                            aria-label={`${CATEGORY_LABELS[category]} via ${CHANNEL_LABELS[channel]}`}
                            className="h-4 w-4"
                            checked={!!prefs.channels[channel]?.[category]}
                            onChange={() => toggleChannel(channel, category)}
                          />
                        </label>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-600 mt-2">
            Preferences are saved to your account, so they follow you across devices.
          </p>
        </section>
      )}

      {/* Quiet hours */}
      {supported && (
        <section className="pt-4 border-t border-white/[0.06] space-y-3">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={quietHours.enabled}
              onChange={(e) => setQuietHours((prev) => ({ ...prev, enabled: e.target.checked }))}
            />
            Quiet hours — suppress non-critical notifications
          </label>
          {quietHours.enabled && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block text-xs text-gray-400">
                Start
                <input
                  type="time"
                  className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 text-white px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                  value={quietHours.start}
                  onChange={(e) => setQuietHours((prev) => ({ ...prev, start: e.target.value }))}
                />
              </label>
              <label className="block text-xs text-gray-400">
                End
                <input
                  type="time"
                  className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 text-white px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                  value={quietHours.end}
                  onChange={(e) => setQuietHours((prev) => ({ ...prev, end: e.target.value }))}
                />
              </label>
              <label className="block text-xs text-gray-400">
                Timezone
                <input
                  type="text"
                  placeholder="America/New_York"
                  className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 text-white px-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
                  value={quietHours.timezone}
                  onChange={(e) => setQuietHours((prev) => ({ ...prev, timezone: e.target.value }))}
                />
              </label>
            </div>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={saveQuietHours}
              disabled={busy}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
            >
              Save quiet hours
            </button>
          </div>
        </section>
      )}
    </div>
  );
}