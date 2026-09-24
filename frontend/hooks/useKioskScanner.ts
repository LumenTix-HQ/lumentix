'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ScanResult {
  outcome: 'success' | 'error';
  message: string;
  ticketId?: string;
  eventId?: string;
  attendeeName?: string;
  attendeeEmail?: string;
  ticketType?: string;
}

const RESULT_DISPLAY_MS = 4_000;

/**
 * Analytics #1005 — drives kiosk check-in scanning.
 *
 * Gate-side barcode/QR scanners typically act as a "keyboard wedge": they
 * type the decoded payload into whatever input is focused, followed by
 * Enter. This hook keeps a hidden input focused at all times and submits
 * whatever was typed once Enter arrives, so no camera or QR-decoding
 * library is needed on the kiosk itself.
 */
export function useKioskScanner() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    focusInput();
    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
  }, [focusInput]);

  const scheduleAutoClear = useCallback(() => {
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    clearTimerRef.current = setTimeout(() => {
      setResult(null);
      focusInput();
    }, RESULT_DISPLAY_MS);
  }, [focusInput]);

  const submitScan = useCallback(
    async (qrData: string) => {
      const trimmed = qrData.trim();
      if (!trimmed || isSubmitting) return;

      setIsSubmitting(true);
      try {
        const response = await fetch('/api/proxy/tickets/verify-qr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ qrData: trimmed }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          setResult({
            outcome: 'error',
            message: data?.message ?? 'This ticket could not be verified.',
          });
        } else {
          setResult({
            outcome: 'success',
            message: 'Checked in',
            ticketId: data.ticketId,
            eventId: data.eventId,
            attendeeName: data.attendeeName,
            attendeeEmail: data.attendeeEmail,
            ticketType: data.ticketType,
          });
        }
      } catch {
        setResult({
          outcome: 'error',
          message: 'Network error — could not reach the server. Try again.',
        });
      } finally {
        setIsSubmitting(false);
        scheduleAutoClear();
      }
    },
    [isSubmitting, scheduleAutoClear],
  );

  const dismissResult = useCallback(() => {
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    setResult(null);
    focusInput();
  }, [focusInput]);

  return { result, isSubmitting, inputRef, focusInput, submitScan, dismissResult };
}
