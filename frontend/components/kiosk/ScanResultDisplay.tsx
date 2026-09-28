import { useState } from 'react';
import type { ScanResult } from '@/hooks/useKioskScanner';

function initials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- Public function name specified by the issue.
export function show_attendee_photo(photoUrl?: string): string | undefined {
  if (!photoUrl) return undefined;
  try { return new URL(photoUrl).protocol === 'https:' ? photoUrl : undefined; }
  catch { return undefined; }
}

function AttendeePhoto({ name, photoUrl }: { name?: string; photoUrl?: string }) {
  const [failed, setFailed] = useState(false);
  const source = show_attendee_photo(photoUrl);
  if (source && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={source} alt={name ? `Photo of ${name}` : 'Attendee photo'}
      onError={() => setFailed(true)} referrerPolicy="no-referrer"
      className="h-40 w-40 rounded-2xl object-cover ring-4 ring-white/20" />;
  }
  return <div className="text-center"><div role="img" aria-label="No attendee photo available"
    className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-white/10 text-4xl">{initials(name)}</div>
    <p className="mt-2">No photo available — check attendee ID</p></div>;
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- Public function name specified by the issue.
export function display_scan_result(result: ScanResult): string {
  return result.outcome === 'success' ? 'Checked In' : 'Not Verified';
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
      className={`flex min-h-[70vh] flex-col items-center justify-center gap-6 rounded-3xl p-10 text-center motion-safe:animate-[pulse_0.4s_ease-in-out_1] ${
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
        {display_scan_result(result)}
      </h2>

      {isSuccess ? (
        <div className="flex flex-col items-center gap-4">
          <AttendeePhoto key={result.ticketId} name={result.attendeeName} photoUrl={result.attendeePhotoUrl} />
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

      <button type="button" autoFocus onClick={onDismiss} className="min-h-14 rounded-xl border-2 border-white px-8 py-3 text-lg font-semibold">{isSuccess ? "Photo checked — scan next ticket" : "Scan next ticket"}</button>
    </div>
  );
}
