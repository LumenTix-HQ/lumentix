/**
 * Ticket gifting types.
 *
 * These mirror the backend contract in
 * `backend/src/tickets/gifting/ticket-gift.entity.ts` and
 * `backend/src/tickets/gifting/gifting.service.ts`. The reveal is described as
 * an ordered list of frames rather than markup so the styling stays a client
 * concern and the server does not dictate how a gift looks.
 */

export type GiftWrapStyle =
  | "classic"
  | "confetti"
  | "fireworks"
  | "envelope"
  | "birthday";

export type GiftStatus =
  | "wrapped"
  | "scheduled"
  | "delivered"
  | "unwrapped"
  | "cancelled";

export interface GiftWrapResult {
  giftId: string;
  ticketId: string;
  status: GiftStatus;
  wrapStyle: GiftWrapStyle;
  message: string | null;
  scheduledFor: string | null;
  deliveredAt: string | null;
}

export interface GiftFrame {
  step: string;
  durationMs: number;
}

export interface UnwrapAnimation {
  giftId: string;
  wrapStyle: GiftWrapStyle;
  message: string | null;
  senderId: string;
  ticketId: string;
  eventId: string;
  eventTitle: string | null;
  frames: GiftFrame[];
  totalDurationMs: number;
  /** False when the reveal has already been played once. */
  firstUnwrap: boolean;
}

export interface GiftTicketInput {
  recipientId: string;
  message?: string;
  wrapStyle?: GiftWrapStyle;
  scheduledFor?: string;
}

/**
 * Presentation for each wrap style.
 *
 * `emoji` is the glyph shown while the box is still closed, `revealEmoji` the
 * one that takes over once it opens, and `accent` the colour the frame is
 * tinted with.
 */
export const WRAP_STYLES: ReadonlyArray<{
  value: GiftWrapStyle;
  label: string;
  emoji: string;
  revealEmoji: string;
  accent: string;
  ring: string;
}> = [
  {
    value: "classic",
    label: "Classic",
    emoji: "\u{1F381}",
    revealEmoji: "\u{1F3A6}",
    accent: "from-rose-500/30 to-rose-500/5",
    ring: "border-rose-400/60",
  },
  {
    value: "confetti",
    label: "Confetti",
    emoji: "\u{1F38A}",
    revealEmoji: "\u{1F389}",
    accent: "from-amber-400/30 to-amber-400/5",
    ring: "border-amber-300/60",
  },
  {
    value: "fireworks",
    label: "Fireworks",
    emoji: "\u{1F386}",
    revealEmoji: "\u{1F387}",
    accent: "from-purple-500/30 to-purple-500/5",
    ring: "border-purple-400/60",
  },
  {
    value: "envelope",
    label: "Envelope",
    emoji: "\u{2709}\u{FE0F}",
    revealEmoji: "\u{1F48C}",
    accent: "from-blue-500/30 to-blue-500/5",
    ring: "border-blue-400/60",
  },
  {
    value: "birthday",
    label: "Birthday",
    emoji: "\u{1F382}",
    revealEmoji: "\u{1F388}",
    accent: "from-pink-500/30 to-pink-500/5",
    ring: "border-pink-400/60",
  },
];

export function wrapStyleMeta(style: GiftWrapStyle) {
  return (
    WRAP_STYLES.find((s) => s.value === style) ?? WRAP_STYLES[0]
  );
}
