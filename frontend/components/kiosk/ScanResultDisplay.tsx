import type { ScanResult } from '@/hooks/useKioskScanner';

function initials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Analytics #1005 — a placeholder attendee "photo": there is no photo field
 * on the ticket/check-in API today, so this renders an initials avatar
 * instead. Swapping in a real photo just means passing a `photoUrl` prop
 * once one exists.
 */
function AttendeePhoto({ name, photoUrl }: { name?: string; photoUrl?: string }) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={photoUrl}
        alt={name ? `Photo of ${name}` : 'Attendee photo'}
        className="h-28 w-28 rounded-full object-cover ring-4 ring-white/20"
      />
    );
  }

  return (
    <div
      className="flex h-28 w-28 items-center justify-center rounded-full bg-white/10 text-4xl font-bold text-white ring-4 ring-white/20"
      aria-label={name ? `Photo of ${name}` : 'Attendee photo'}
      role="img"
    >
      {initials(name)}
    </div>
  );
}

export interface ScanResultDisplayProps {
  result: ScanResult;
  onDismiss: () => void;
}

/**
 * Analytics #1005 — full-screen success/failure display for a single scan,
 * sized for gate staff to read at a glance from arm's length.
 */
export function ScanResultDisplay({ result, onDismiss }: ScanResultDisplayProps) {
  const isSuccess = result.outcome === 'success';

  return (
    <div
      role="status"
      aria-live="assertive"
      onClick={onDismiss}
      className={`flex min-h-[70vh] cursor-pointer flex-col items-center justify-center gap-6 rounded-3xl p-10 text-center transition-colors ${
        isSuccess ? 'bg-green-600/90' : 'bg-red-600/90'
      }`}
    >
      <div
        className={`flex h-24 w-24 items-center justify-center rounded-full text-6xl ${
          isSuccess ? 'bg-white/20' : 'bg-white/20'
        }`}
        aria-hidden="true"
      >
        {isSuccess ? '✓' : '✕'}
      </div>

      <h2 className="text-4xl font-extrabold text-white sm:text-5xl">
        {isSuccess ? 'Checked In' : 'Not Verified'}
      </h2>

      {isSuccess ? (
        <div className="flex flex-col items-center gap-4">
          <AttendeePhoto name={result.attendeeName} />
          <div>
            <p className="text-2xl font-semibold text-white">{result.attendeeName ?? 'Attendee'}</p>
            <p className="text-white/80">{result.attendeeEmail}</p>
            {result.ticketType && (
              <p className="mt-1 text-sm uppercase tracking-wider text-white/70">{result.ticketType}</p>
            )}
          </div>
        </div>
      ) : (
        <p className="max-w-md text-lg text-white/90">{result.message}</p>
      )}

      <p className="text-sm text-white/70">Tap anywhere to scan the next ticket</p>
    </div>
  );
}
