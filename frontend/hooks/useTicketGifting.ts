"use client";

import { useCallback, useState } from "react";
import { apiClient } from "@/lib/api-client";
import type { GiftWrapStyle, UnwrapAnimation } from "@/types/gifting";

export interface GiftTicketInput {
  recipientId: string;
  message: string;
  wrapStyle: GiftWrapStyle;
  scheduledFor?: string;
}

export interface UseTicketGiftingResult {
  /** Gift currently open in the wrap composer. */
  giftTarget: { ticketId: string; eventTitle: string } | null;
  /** Reveal currently playing, if any. */
  reveal: UnwrapAnimation | null;
  isBusy: boolean;
  error: string | null;
  success: string | null;
  openGift: (target: { ticketId: string; eventTitle: string }) => void;
  closeGift: () => void;
  submitGift: (input: GiftTicketInput) => Promise<void>;
  cancelGift: (giftId: string) => Promise<void>;
  playReveal: (giftId: string) => Promise<void>;
  closeReveal: () => void;
  dismissMessages: () => void;
}

function messageFor(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/**
 * Drives the gift lifecycle for the tickets page.
 *
 * Each call resets the shared error/success state first so a retry after a
 * failure does not leave the previous message on screen.
 */
export function useTicketGifting(): UseTicketGiftingResult {
  const [giftTarget, setGiftTarget] = useState<{
    ticketId: string;
    eventTitle: string;
  } | null>(null);
  const [reveal, setReveal] = useState<UnwrapAnimation | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const openGift = useCallback(
    (target: { ticketId: string; eventTitle: string }) => {
      setError(null);
      setSuccess(null);
      setGiftTarget(target);
    },
    [],
  );

  const closeGift = useCallback(() => {
    if (isBusy) return;
    setGiftTarget(null);
    setError(null);
  }, [isBusy]);

  const submitGift = useCallback(
    async (input: GiftTicketInput) => {
      if (!giftTarget) return;
      setIsBusy(true);
      setError(null);
      setSuccess(null);
      try {
        const message = input.message?.trim();
        const result = await apiClient.giftTicket(giftTarget.ticketId, {
          recipientId: input.recipientId,
          message: message || undefined,
          wrapStyle: input.wrapStyle,
          scheduledFor: input.scheduledFor,
        });
        setGiftTarget(null);
        setSuccess(
          result.status === "scheduled"
            ? `Gift scheduled. It will be delivered on ${new Date(
                result.scheduledFor ?? "",
              ).toLocaleString()}.`
            : "Gift sent. Your recipient can unwrap it now.",
        );
      } catch (err) {
        setError(messageFor(err, "Failed to send the gift."));
      } finally {
        setIsBusy(false);
      }
    },
    [giftTarget],
  );

  const cancelGift = useCallback(async (giftId: string) => {
    setIsBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await apiClient.cancelGift(giftId);
      setSuccess("Gift cancelled. The ticket is still yours.");
    } catch (err) {
      setError(messageFor(err, "Failed to cancel the gift."));
    } finally {
      setIsBusy(false);
    }
  }, []);

  const playReveal = useCallback(async (giftId: string) => {
    setIsBusy(true);
    setError(null);
    try {
      setReveal(await apiClient.unwrapGift(giftId));
    } catch (err) {
      setError(messageFor(err, "Failed to open the gift."));
    } finally {
      setIsBusy(false);
    }
  }, []);

  const closeReveal = useCallback(() => setReveal(null), []);

  const dismissMessages = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  return {
    giftTarget,
    reveal,
    isBusy,
    error,
    success,
    openGift,
    closeGift,
    submitGift,
    cancelGift,
    playReveal,
    closeReveal,
    dismissMessages,
  };
}
