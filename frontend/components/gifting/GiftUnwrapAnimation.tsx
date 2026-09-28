"use client";

import { useEffect, useRef, useState } from "react";
import { wrapStyleMeta, type UnwrapAnimation as Reveal } from "@/types/gifting";

export interface GiftUnwrapAnimationProps {
  reveal: Reveal;
  onDone: () => void;
}

const STEP_LABELS: Record<string, string> = {
  "ribbon-pull": "Untying the ribbon…",
  "box-open": "Opening the box…",
  "box-burst": "Bursting open…",
  "confetti-fall": "Confetti everywhere…",
  "fuse-light": "Lighting the fuse…",
  burst: "Fireworks!",
  "seal-break": "Breaking the seal…",
  "flap-open": "Opening the envelope…",
  "card-slide": "Sliding out the card…",
  "candles-light": "Lighting the candles…",
  "candles-blow": "Blowing out the candles…",
  "ticket-rise": "Your ticket is here…",
  "message-reveal": "Unwrapping your message…",
};

const DEFAULT_STEP_LABEL = "Unwrapping your gift…";

/**
 * Plays the reveal described by the backend.
 *
 * The frame list drives the timing so the animation matches the wrap style the
 * sender actually chose. Frames are stepped on a timer rather than with a CSS
 * animation because the sequence has to be pausable and readable by assistive
 * tech, and because the total duration is data rather than something baked into
 * a stylesheet. A "Skip" control is always available — an animation nobody can
 * get past is a worse experience than no animation.
 */
export function GiftUnwrapAnimation({ reveal, onDone }: GiftUnwrapAnimationProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meta = wrapStyleMeta(reveal.wrapStyle);

  useEffect(() => {
    const frame = reveal.frames[stepIndex];
    if (!frame) return;

    timerRef.current = setTimeout(() => {
      setStepIndex((i) => i + 1);
    }, frame.durationMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [reveal.frames, stepIndex]);

  // Advance straight to the finished state once the last frame elapses.
  useEffect(() => {
    if (stepIndex >= reveal.frames.length) {
      onDone();
    }
  }, [stepIndex, reveal.frames.length, onDone]);

  const frame = reveal.frames[stepIndex];
  const isFinished = stepIndex >= reveal.frames.length;
  // Every wrap ends on `message-reveal`, and the message has to outlive that
  // frame — otherwise the note disappears at the exact moment it is readable.
  const showMessage = frame?.step === "message-reveal" || isFinished;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Gift reveal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
    >
      <div
        className={`w-full max-w-md rounded-2xl border bg-gradient-to-b ${meta.accent} ${meta.ring} p-8 text-center shadow-2xl`}
      >
        {!isFinished && (
          <>
            <div
              aria-hidden="true"
              className="text-6xl transition-transform duration-500"
              key={frame?.step}
            >
              {showMessage ? meta.revealEmoji : meta.emoji}
            </div>

            <p aria-live="polite" className="mt-5 text-sm text-gray-300">
              {STEP_LABELS[frame?.step ?? ""] ?? DEFAULT_STEP_LABEL}
            </p>

            <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-indigo-400 transition-[width] duration-300"
                style={{
                  width: `${Math.round(
                    ((stepIndex + 1) / Math.max(reveal.frames.length, 1)) * 100,
                  )}%`,
                }}
              />
            </div>
          </>
        )}

        {showMessage && (
          <blockquote
            data-testid="gift-message"
            className="mt-5 rounded-xl border border-white/10 bg-black/30 p-4 text-left text-sm text-gray-100 whitespace-pre-wrap"
          >
            {reveal.message ?? "No message — just good vibes."}
          </blockquote>
        )}

        <p className="mt-5 text-xs text-gray-400">
          {reveal.eventTitle ?? "Your event"} &middot; ticket {reveal.ticketId}
        </p>

        {!reveal.firstUnwrap && (
          <p className="mt-1 text-xs text-gray-500">
            You have already unwrapped this gift.
          </p>
        )}

        <button
          type="button"
          onClick={onDone}
          className="mt-6 w-full rounded-lg border border-gray-600 bg-gray-800 hover:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-200 hover:text-white transition-colors"
        >
          {isFinished ? "Close" : "Skip"}
        </button>
      </div>
    </div>
  );
}

export default GiftUnwrapAnimation;
