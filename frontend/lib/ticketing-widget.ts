export type TicketingWidgetTheme = "light" | "dark";

export interface TicketingWidgetEvent {
  id: string;
  title: string;
  location?: string;
  startDate?: string;
  ticketPrice: number;
  currency: string;
  availableTickets?: number;
}

export interface TicketingWidgetOptions {
  event: TicketingWidgetEvent;
  partnerId: string;
  container: HTMLElement | string;
  checkoutBaseUrl?: string;
  theme?: TicketingWidgetTheme;
  ctaLabel?: string;
  referralSource?: string;
  onPaymentStart?: (payload: WidgetPaymentPayload) => void;
}

export interface WidgetPaymentPayload {
  eventId: string;
  partnerId: string;
  quantity: number;
  referralCode: string;
  checkoutUrl: string;
}

export interface WidgetReferralRecord {
  eventId: string;
  partnerId: string;
  referralSource: string;
  referralCode: string;
  timestamp: string;
}

function resolveContainer(container: HTMLElement | string): HTMLElement {
  if (typeof container !== "string") return container;
  const element = document.querySelector<HTMLElement>(container);
  if (!element) {
    throw new Error(`Ticketing widget container not found: ${container}`);
  }
  return element;
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

function buildReferralCode(eventId: string, partnerId: string, source: string): string {
  return [partnerId, eventId, source]
    .join(":")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function appendStyles(root: HTMLElement): void {
  const style = document.createElement("style");
  style.textContent = `
    .lumentix-ticket-widget{font-family:Inter,system-ui,sans-serif;border:1px solid #d8e0ea;border-radius:12px;padding:16px;max-width:360px;background:#fff;color:#0f172a;box-shadow:0 16px 40px rgba(15,23,42,.08)}
    .lumentix-ticket-widget[data-theme="dark"]{background:#0f172a;color:#f8fafc;border-color:#334155}
    .lumentix-ticket-widget__title{font-size:18px;font-weight:700;margin:0 0 8px}
    .lumentix-ticket-widget__meta{font-size:13px;color:#64748b;margin:0 0 12px}.lumentix-ticket-widget[data-theme="dark"] .lumentix-ticket-widget__meta{color:#cbd5e1}
    .lumentix-ticket-widget__row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:12px 0}
    .lumentix-ticket-widget__price{font-size:20px;font-weight:700}
    .lumentix-ticket-widget__quantity{width:72px;border:1px solid #cbd5e1;border-radius:8px;padding:8px;background:inherit;color:inherit}
    .lumentix-ticket-widget__button{width:100%;border:0;border-radius:8px;background:#2563eb;color:#fff;font-weight:700;padding:10px 12px;cursor:pointer}
    .lumentix-ticket-widget__button:disabled{opacity:.55;cursor:not-allowed}
  `;
  root.appendChild(style);
}

export function track_widget_referrals(
  eventId: string,
  partnerId: string,
  referralSource = "embed",
): WidgetReferralRecord {
  const record = {
    eventId,
    partnerId,
    referralSource,
    referralCode: buildReferralCode(eventId, partnerId, referralSource),
    timestamp: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    const key = "lumentix_widget_referrals";
    const existing = JSON.parse(window.localStorage.getItem(key) || "[]") as WidgetReferralRecord[];
    window.localStorage.setItem(key, JSON.stringify([...existing, record]));
  }

  return record;
}

export function initialize_widget_payment(options: {
  eventId: string;
  partnerId: string;
  quantity?: number;
  checkoutBaseUrl?: string;
  referralSource?: string;
}): WidgetPaymentPayload {
  const quantity = Math.max(1, Math.floor(options.quantity ?? 1));
  const referral = track_widget_referrals(
    options.eventId,
    options.partnerId,
    options.referralSource,
  );
  const baseUrl = options.checkoutBaseUrl ?? "/checkout";
  const checkoutUrl = `${baseUrl.replace(/\/$/, "")}/${encodeURIComponent(options.eventId)}?qty=${quantity}&ref=${encodeURIComponent(referral.referralCode)}`;

  return {
    eventId: options.eventId,
    partnerId: options.partnerId,
    quantity,
    referralCode: referral.referralCode,
    checkoutUrl,
  };
}

export function render_ticketing_widget(options: TicketingWidgetOptions): HTMLElement {
  const container = resolveContainer(options.container);
  const root = document.createElement("section");
  const theme = options.theme ?? "light";
  const soldOut = options.event.availableTickets === 0;

  root.className = "lumentix-ticket-widget";
  root.dataset.theme = theme;
  root.setAttribute("aria-label", `Buy tickets for ${options.event.title}`);
  appendStyles(root);

  root.innerHTML += `
    <h3 class="lumentix-ticket-widget__title"></h3>
    <p class="lumentix-ticket-widget__meta"></p>
    <div class="lumentix-ticket-widget__row">
      <span class="lumentix-ticket-widget__price"></span>
      <label>Qty <input class="lumentix-ticket-widget__quantity" type="number" min="1" value="1" ${soldOut ? "disabled" : ""}></label>
    </div>
    <button class="lumentix-ticket-widget__button" type="button" ${soldOut ? "disabled" : ""}></button>
  `;

  root.querySelector<HTMLElement>(".lumentix-ticket-widget__title")!.textContent = options.event.title;
  root.querySelector<HTMLElement>(".lumentix-ticket-widget__meta")!.textContent = [
    options.event.location,
    options.event.startDate ? new Date(options.event.startDate).toLocaleDateString() : undefined,
  ].filter(Boolean).join(" - ");
  root.querySelector<HTMLElement>(".lumentix-ticket-widget__price")!.textContent = formatMoney(options.event.ticketPrice, options.event.currency);
  root.querySelector<HTMLButtonElement>(".lumentix-ticket-widget__button")!.textContent = soldOut ? "Sold out" : options.ctaLabel ?? "Buy tickets";

  root.querySelector<HTMLButtonElement>(".lumentix-ticket-widget__button")!.addEventListener("click", () => {
    const quantityInput = root.querySelector<HTMLInputElement>(".lumentix-ticket-widget__quantity")!;
    const payload = initialize_widget_payment({
      eventId: options.event.id,
      partnerId: options.partnerId,
      quantity: Number(quantityInput.value),
      checkoutBaseUrl: options.checkoutBaseUrl,
      referralSource: options.referralSource,
    });
    options.onPaymentStart?.(payload);
    if (!options.onPaymentStart && typeof window !== "undefined") {
      window.location.assign(payload.checkoutUrl);
    }
  });

  container.replaceChildren(root);
  return root;
}