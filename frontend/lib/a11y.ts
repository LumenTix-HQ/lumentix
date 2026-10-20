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
    region.setAttribute("role", "status");
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
  const name = seat.seatIdentifier || `${String.fromCharCode(64 + seat.row)}${seat.number}`;
  const state = isSelected
    ? "selected"
    : seat.status === "booked"
      ? "booked, unavailable"
      : seat.status === "held"
        ? "held, unavailable"
        : "available";
  const details = [
    seat.pricingTier,
    typeof seat.price === "number" ? `${seat.price.toLocaleString()} XLM` : null,
    seat.obstructedView ? "obstructed view" : null,
  ].filter(Boolean);
  return [`Seat ${name}`, state, ...details].join(", ");
}

function tierAriaLabel(
  tier: VipTier,
  isSelected: boolean,
  isFull: boolean,
  priceLabel?: string,
): string {
  const remaining = tier.maxSlots - tier.filledSlots;
  const state = isFull ? "sold out" : isSelected ? "selected" : `${remaining} remaining`;
  return [`${tier.name} tier`, priceLabel, state].filter(Boolean).join(", ");
}

/** Descriptive aria-label builders for the ticket selection flow. */
export const injectAriaLabels = {
  seat: seatAriaLabel,
  tier: tierAriaLabel,
};

const NATIVE_FOCUSABLE = "a[href], button, input, select, textarea, summary";
const WIDGET_ROLES = ["button", "checkbox", "radio", "switch", "tab", "option", "link", "gridcell"];

function hasAccessibleName(el: Element): boolean {
  if (el.getAttribute("aria-label")?.trim() || el.getAttribute("aria-labelledby")) return true;
  if (el.getAttribute("title")?.trim()) return true;
  if ((el.textContent ?? "").trim().length > 0) return true;
  // An image with alt text inside the control names it.
  return Array.from(el.querySelectorAll("img[alt]")).some(
    (img) => (img.getAttribute("alt") ?? "").trim().length > 0,
  );
}

function hasLabel(control: Element): boolean {
  if (control.getAttribute("aria-label")?.trim() || control.getAttribute("aria-labelledby")) {
    return true;
  }
  if (control.closest("label")) return true;
  const id = control.getAttribute("id");
  if (!id) return false;
  return Array.from(control.ownerDocument?.querySelectorAll("label[for]") ?? []).some(
    (label) => (label as HTMLLabelElement).htmlFor === id,
  );
}

function describe(el: Element): string {
  return el.outerHTML.slice(0, 80);
}

/**
 * Audits a subtree for common a11y omissions in the ticket purchase flow:
 * - interactive elements without an accessible name
 * - custom widgets (role="button" etc.) that can't receive keyboard focus
 * - interactive elements hidden inside role="img" (children of an image are
 *   presentational, so screen readers never reach them)
 * - form controls without a label
 * - images without alt text
 * Logs and returns the issues found; a no-op in production builds.
 */
export function validateA11yCompliance(root: ParentNode = document): string[] {
  if (process.env.NODE_ENV === "production") return [];

  const issues: string[] = [];
  const widgetSelector = WIDGET_ROLES.map((role) => `[role='${role}']`).join(", ");

  root.querySelectorAll(`button, ${widgetSelector}`).forEach((el) => {
    if (!hasAccessibleName(el)) {
      issues.push(`Interactive element without an accessible name: ${describe(el)}`);
    }
  });

  root.querySelectorAll(widgetSelector).forEach((el) => {
    if (el.matches(NATIVE_FOCUSABLE)) return;
    if (el.getAttribute("aria-disabled") === "true") return;
    if (!el.hasAttribute("tabindex")) {
      issues.push(`Custom widget is not keyboard focusable (missing tabindex): ${describe(el)}`);
    }
  });

  root.querySelectorAll("[role='img']").forEach((img) => {
    if (img.querySelector(`${NATIVE_FOCUSABLE}, ${widgetSelector}`)) {
      issues.push(`Interactive content inside role="img" is hidden from screen readers: ${describe(img)}`);
    }
  });

  root
    .querySelectorAll("input:not([type='hidden']):not([type='submit']):not([type='button']), select, textarea")
    .forEach((el) => {
      if (!hasLabel(el)) {
        issues.push(`Form control without a label: ${describe(el)}`);
      }
    });

  root.querySelectorAll("img").forEach((el) => {
    if (!el.hasAttribute("alt")) {
      issues.push(`Image without alt text: ${describe(el)}`);
    }
  });

  if (issues.length > 0) {
    // eslint-disable-next-line no-console
    console.warn("[a11y] compliance issues found:", issues);
  }

  return issues;
}
