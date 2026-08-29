'use client';

import { useEffect, useState } from 'react';
import {
  isPushSupported,
  getPermissionState,
  getExistingSubscription,
  subscribeToPush,
  unsubscribeFromPush,
  type PushPermission,
} from '@/lib/push/push-notifications';

const PREF_STORAGE_KEY = 'lumentix_notification_prefs';

interface NotificationPrefs {
  eventReminders: boolean;
  scheduleChanges: boolean;
  paymentConfirmations: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  eventReminders: true,
  scheduleChanges: true,
  paymentConfirmations: true,
};

const PREF_LABELS: Array<{ key: keyof NotificationPrefs; label: string }> = [
  { key: 'eventReminders', label: 'Event reminders' },
  { key: 'scheduleChanges', label: 'Schedule changes' },
  { key: 'paymentConfirmations', label: 'Payment confirmations' },
];

function loadPrefs(): NotificationPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(PREF_STORAGE_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export default function NotificationPreferences() {
  const [permission, setPermission] = useState<PushPermission>('unsupported');
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    setPermission(getPermissionState());
    setPrefs(loadPrefs());
    if (isPushSupported()) {
      getExistingSubscription().then((sub) => setSubscribed(!!sub)).catch(() => {});
    }
  }, []);

  const supported = permission !== 'unsupported';

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

  function togglePref(key: keyof NotificationPrefs) {
    setPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable — non-fatal */
      }
      return next;
    });
  }

  if (!supported) {
    return (
      <p className="text-sm text-gray-500">
        Push notifications are not supported in this browser.
      </p>
    );
  }

  return (
    <div className="space-y-4">
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

      <fieldset className="space-y-2 pt-2 border-t border-white/[0.06]" disabled={!subscribed}>
        <legend className="text-xs text-gray-500 uppercase tracking-widest mb-1">
          Notify me about
        </legend>
        {PREF_LABELS.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={prefs[key]}
              onChange={() => togglePref(key)}
            />
            {label}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
