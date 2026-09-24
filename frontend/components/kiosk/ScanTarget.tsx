import { type RefObject } from 'react';

export interface ScanTargetProps {
  inputRef: RefObject<HTMLInputElement | null>;
  isSubmitting: boolean;
  onSubmit: (value: string) => void;
}

/**
 * Analytics #1005 — the idle "ready to scan" state: a large, unmissable
 * target plus a hidden input that stays focused so a hardware barcode/QR
 * scanner (which types the decoded payload like a keyboard) can feed it.
 */
export function ScanTarget({ inputRef, isSubmitting, onSubmit }: ScanTargetProps) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-8 rounded-3xl border-4 border-dashed border-white/20 p-10 text-center">
      <div
        className={`flex h-40 w-40 items-center justify-center rounded-3xl border-4 border-purple-400/60 text-7xl transition-transform ${
          isSubmitting ? 'scale-95 opacity-60' : 'animate-pulse'
        }`}
        aria-hidden="true"
      >
        🎫
      </div>
      <div>
        <h2 className="text-3xl font-bold text-white sm:text-4xl">
          {isSubmitting ? 'Checking ticket…' : 'Scan Ticket to Check In'}
        </h2>
        <p className="mt-2 text-gray-400">Point the scanner at the attendee&apos;s QR code</p>
      </div>

      {/* Kept focused and visually hidden; hardware scanners type into whatever
          input has focus, so this is the real receiver for scan input. */}
      <input
        ref={inputRef}
        type="text"
        inputMode="none"
        autoComplete="off"
        aria-label="Scanner input"
        className="sr-only"
        disabled={isSubmitting}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            const value = event.currentTarget.value;
            event.currentTarget.value = '';
            onSubmit(value);
          }
        }}
      />
    </div>
  );
}
