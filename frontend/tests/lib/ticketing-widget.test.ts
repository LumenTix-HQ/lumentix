import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  initialize_widget_payment,
  render_ticketing_widget,
  track_widget_referrals,
} from "@/lib/ticketing-widget";

describe("ticketing widget", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="widget"></div>';
    localStorage.clear();
  });

  it("renders an embeddable widget and starts payment with referral tracking", () => {
    const onPaymentStart = vi.fn();

    render_ticketing_widget({
      container: "#widget",
      partnerId: "Partner Blog",
      referralSource: "article-42",
      checkoutBaseUrl: "https://tickets.example.com/buy",
      event: {
        id: "event-123",
        title: "Lumen Live",
        location: "Lagos",
        startDate: "2026-04-15T10:00:00Z",
        ticketPrice: 25,
        currency: "USD",
        availableTickets: 20,
      },
      onPaymentStart,
    });

    expect(document.querySelector(".lumentix-ticket-widget__title")?.textContent).toBe("Lumen Live");
    document.querySelector<HTMLButtonElement>(".lumentix-ticket-widget__button")?.click();

    expect(onPaymentStart).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-123",
        partnerId: "Partner Blog",
        quantity: 1,
        referralCode: "partner-blog-event-123-article-42",
      }),
    );
    expect(localStorage.getItem("lumentix_widget_referrals")).toContain("partner-blog-event-123-article-42");
  });

  it("returns a checkout URL when initializing widget payment", () => {
    const payload = initialize_widget_payment({
      eventId: "event-9",
      partnerId: "Partner",
      quantity: 3,
      checkoutBaseUrl: "/checkout",
    });

    expect(payload.checkoutUrl).toBe("/checkout/event-9?qty=3&ref=partner-event-9-embed");
  });

  it("disables the widget when an event is sold out", () => {
    render_ticketing_widget({
      container: "#widget",
      partnerId: "partner",
      event: {
        id: "sold-out",
        title: "Sold Out Show",
        ticketPrice: 10,
        currency: "USD",
        availableTickets: 0,
      },
    });

    expect(document.querySelector<HTMLButtonElement>(".lumentix-ticket-widget__button")?.disabled).toBe(true);
    expect(document.querySelector(".lumentix-ticket-widget__button")?.textContent).toBe("Sold out");
  });

  it("tracks referral records independently", () => {
    const record = track_widget_referrals("event-1", "Partner Site", "sidebar");

    expect(record.referralCode).toBe("partner-site-event-1-sidebar");
    expect(JSON.parse(localStorage.getItem("lumentix_widget_referrals") || "[]")).toHaveLength(1);
  });
});