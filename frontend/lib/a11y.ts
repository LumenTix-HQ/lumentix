import type { Seat, VipTier } from "@/types/event";

const LIVE_REGION_ID = "a11y-live-announcer";

/**
 * Announces a message to screen readers via a shared visually-hidden
 * aria-live region. Used for state changes (seat/tier selection, payment
 * status) that don't otherwise map to a visible, persistent status message.
 */
export function announceCartUpdate(message: string): void {
  if (typeof document === "undefined" || !message) return;

  let region = document.getElementById(LIVE_REGION_ID);
  if (!region) {
    region = document.createElement("div");
    region.id = LIVE_REGION_ID;
    region.setAttribute("aria-live", "polite");
    region.setAttribute("aria-atomic", "true");
    region.className = "sr-only";
    document.body.appendChild(region);
  }

  // Clear first so repeated identical messages are still announced.
  region.textContent = "";
  window.setTimeout(() => {
    if (region) region.textContent = message;
  }, 50);
}

function seatAriaLabel(seat: Seat, isSelected: boolean): string {
  const rowLabel = String.fromCharCode(64 + seat.row);
  const state = isSelected
    ? "selected"
    : seat.status === "booked"
      ? "booked, unavailable"
      : seat.status === "held"
        ? "held, unavailable"
        : "available";
  return `Seat ${rowLabel}${seat.number}, ${state}`;
}

function tierAriaLabel(tier: VipTier, isSelected: boolean, isFull: boolean): string {
  const remaining = tier.maxSlots - tier.filledSlots;
  const state = isFull ? "sold out" : isSelected ? "selected" : `${remaining} remaining`;
  return `${tier.name} tier, ${state}`;
}

/** Descriptive aria-label builders for the ticket selection flow. */
export const injectAriaLabels = {
  seat: seatAriaLabel,
  tier: tierAriaLabel,
};

/**
 * Dev-only audit for common a11y omissions in the ticket purchase flow
 * (interactive elements missing an accessible name, images missing alt
 * text). Logs warnings and returns them; a no-op in production.
 */
export function validateA11yCompliance(root: HTMLElement | Document = document): string[] {
  if (process.env.NODE_ENV !== "development") return [];

  const issues: string[] = [];

  root.querySelectorAll("button, [role='button']").forEach((el) => {
    const hasName =
      el.getAttribute("aria-label") ||
      el.getAttribute("aria-labelledby") ||
      (el.textContent ?? "").trim().length > 0;
    if (!hasName) {
      issues.push(`Button without an accessible name: ${el.outerHTML.slice(0, 80)}`);
    }
  });

  root.querySelectorAll("img").forEach((el) => {
    if (!el.hasAttribute("alt")) {
      issues.push(`Image without alt text: ${el.outerHTML.slice(0, 80)}`);
    }
  });

  if (issues.length > 0) {
    // eslint-disable-next-line no-console
    console.warn("[a11y] compliance issues found:", issues);
  }

  return issues;
}
