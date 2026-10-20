import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { RecommendationResponse } from "@/types/recommendation";

// Parity with SentimentPanel.test.tsx: mock the api-client module so the
// strip never hits a real backend. The strip resolves its own user from
// useAuth, so we mock the auth context alongside.
const getRecommendations = vi.fn();
const updateUserPreferences = vi.fn();

// The component calls `apiClient.getRecommendations` (there is no top-level export).
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getRecommendations: (...args: unknown[]) => getRecommendations(...args),
    updateUserPreferences: (...args: unknown[]) => updateUserPreferences(...args),
  },
}));

const mockUseAuth = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

// eslint-disable-next-line import/first
import RecommendationStrip from "@/components/recommendations/RecommendationStrip";

const recommendations: RecommendationResponse = {
  userId: "user-1",
  generatedAt: "2026-05-01T09:00:00Z",
  recommendations: [
    {
      eventId: "evt-1",
      title: "Blockchain & Beer Festival 2026",
      category: "Technology",
      location: "Accra, Ghana",
      startDate: "2026-06-14T18:00:00Z",
      ticketPrice: 45,
      currency: "USD",
      score: 0.84,
      reason: "You attend Technology events in Accra",
    },
    {
      eventId: "evt-2",
      title: "Street Food & Vibes",
      category: "Food",
      location: "Accra, Ghana",
      startDate: "2026-07-02T12:00:00Z",
      ticketPrice: 12,
      currency: "GHS",
      score: 0.58,
    },
  ],
};

describe("RecommendationStrip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: { id: "user-1", email: "a@b.c", role: "attendee" },
      isAuthenticated: true,
    });
    getRecommendations.mockResolvedValue(recommendations);
  });

  it("renders one recommendation link per ranked event", async () => {
    render(<RecommendationStrip />);
    const links = await screen.findAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/events/evt-1");
    expect(links[0]).toHaveTextContent("Blockchain & Beer Festival 2026");
    expect(links[0]).toHaveTextContent("84%");
  });

  it("announces the number of personalised suggestions for screen readers", async () => {
    render(<RecommendationStrip />);
    await waitFor(() =>
      expect(screen.getByLabelText("personalized recommendations")).toBeTruthy(),
    );
    const region = screen.getByRole("complementary");
    expect(region).toHaveAttribute("aria-label", "personalized recommendations");
    expect(region).toHaveTextContent("2 suggestions");
  });

  it("sorts suggestions by descending score before rendering", async () => {
    getRecommendations.mockResolvedValue({
      ...recommendations,
      recommendations: [...recommendations.recommendations].reverse(),
    });
    render(<RecommendationStrip />);
    const links = await screen.findAllByRole("link");
    const scores = links.map((link) => Number(link.textContent?.match(/(\d+)%/)?.[1]));
    expect(scores[0]).toBeGreaterThan(scores[1]);
  });

  it("renders nothing when the recommendations list is empty", async () => {
    getRecommendations.mockResolvedValue({
      userId: "user-1",
      recommendations: [],
      generatedAt: "2026-05-01T09:00:00Z",
    });
    const { container } = render(<RecommendationStrip />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("degrades to null on a recommendation fetch error rather than crashing the page", async () => {
    getRecommendations.mockRejectedValue(new Error("recs unavailable"));
    const { container } = render(<RecommendationStrip />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("shows no strip when the current user is anonymous", async () => {
    mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false });
    const { container } = render(<RecommendationStrip />);
    expect(container).toBeEmptyDOMElement();
  });
});
