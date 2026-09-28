"use client";

import { useEffect, useRef, useState } from "react";
import { WRAP_STYLES, type GiftWrapStyle } from "@/types/gifting";

export interface GiftTicketModalProps {
  ticketId: string;
  eventTitle: string;
  eventDate: string;
  /** Current user id, used to block gifting to yourself before the round trip. */
  currentUserId?: string;
  busy: boolean;
  error: string | null;
  onSubmit: (input: {
    recipientId: string;
    message: string;
    wrapStyle: GiftWrapStyle;
    scheduledFor?: string;
  }) => void;
  onClose: () => void;
}

const MESSAGE_LIMIT = 500;

export function GiftTicketModal({
  ticketId,
  eventTitle,
  eventDate,
  currentUserId,
  busy,
  error,
  onSubmit,
  onClose,
}: GiftTicketModalProps) {
  const [recipientId, setRecipientId] = useState("");
  const [message, setMessage] = useState("");
  const [wrapStyle, setWrapStyle] = useState<GiftWrapStyle>("classic");
  const [scheduledFor, setScheduledFor] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // The backend validates all of this too, but catching it here keeps the
  // obvious mistakes off the wire.
  useEffect(() => {
    const trimmedRecipient = recipientId.trim();
    if (!trimmedRecipient) {
      setValidationError("Enter the recipient's user ID.");
    } else if (currentUserId && trimmedRecipient === currentUserId) {
      setValidationError("You cannot gift a ticket to yourself.");
    } else if (scheduledFor) {
      const when = new Date(scheduledFor);
      if (Number.isNaN(when.getTime())) {
        setValidationError("That delivery date is not valid.");
      } else if (when.getTime() <= Date.now()) {
        setValidationError("Choose a delivery date in the future.");
      } else if (when.getTime() >= new Date(eventDate).getTime()) {
        setValidationError("Delivery must happen before the event starts.");
      } else {
        setValidationError(null);
      }
    } else {
      setValidationError(null);
    }
  }, [recipientId, scheduledFor, currentUserId, eventDate]);

  // Escape closes the dialog, matching the rest of the modals in the app.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, busy]);

  const trimmedMessage = message.trim();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validationError || busy) return;
    onSubmit({
      recipientId: recipientId.trim(),
      message: trimmedMessage,
      wrapStyle,
      // An empty date means "deliver as soon as it is wrapped".
      scheduledFor: scheduledFor || undefined,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={() => !busy && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gift-modal-title"
        className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="gift-modal-title" className="text-lg font-bold text-white mb-1">
          Gift this ticket
        </h3>
        <p className="text-sm text-gray-500 mb-5">
          Send <span className="text-white">&quot;{eventTitle}&quot;</span> to someone
          with a message and a wrapping style. They unwrap it to claim the ticket.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-xs text-gray-400">
            Recipient user ID
            <input
              type="text"
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
              placeholder="Their LumenTix user ID"
              aria-label="Recipient user ID"
              className="mt-1.5 w-full rounded-lg bg-gray-800 border border-gray-600 text-white px-3 py-2 text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </label>

          <label className="block text-xs text-gray-400">
            Message
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={MESSAGE_LIMIT}
              rows={3}
              placeholder="Add a note they will see when they unwrap it…"
              aria-label="Gift message"
              className="mt-1.5 w-full rounded-lg bg-gray-800 border border-gray-600 text-white px-3 py-2 text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors resize-y"
            />
            <span className="mt-1 block text-right text-gray-500">
              {message.length}/{MESSAGE_LIMIT}
            </span>
          </label>

          <fieldset>
            <legend className="text-xs text-gray-400 mb-2">Wrapping style</legend>
            <div className="grid grid-cols-5 gap-2">
              {WRAP_STYLES.map((style) => {
                const selected = style.value === wrapStyle;
                return (
                  <button
                    key={style.value}
                    type="button"
                    onClick={() => setWrapStyle(style.value)}
                    aria-pressed={selected}
                    aria-label={style.label}
                    title={style.label}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-xs transition-colors ${
                      selected
                        ? `${style.ring} bg-indigo-600/20 text-white`
                        : "border-gray-700 bg-gray-800 text-gray-400 hover:text-white"
                    }`}
                  >
                    <span aria-hidden="true" className="text-xl">
                      {style.emoji}
                    </span>
                    <span className="truncate w-full text-center">
                      {style.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label className="block text-xs text-gray-400">
            Deliver later (optional)
            <input
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              aria-label="Deliver later"
              className="mt-1.5 w-full rounded-lg bg-gray-800 border border-gray-600 text-white px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
            />
            <span className="mt-1 block text-gray-500">
              Leave blank to deliver as soon as you send it.
            </span>
          </label>

          {validationError && (
            <p role="alert" className="text-sm text-red-400">
              {validationError}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || Boolean(validationError)}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              {busy ? "Wrapping…" : "Wrap and send"}
            </button>
          </div>
        </form>

        <p className="mt-4 text-xs text-gray-600">
          Ticket {ticketId} stays yours until the gift is delivered.
        </p>
      </div>
    </div>
  );
}

export default GiftTicketModal;
