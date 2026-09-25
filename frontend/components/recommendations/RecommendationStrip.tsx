"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { apiClient } from "@/lib/api-client";
import { announceCartUpdate } from "@/lib/a11y";
import type {
  RecommendationResponse,
  RecommendationDto,
} from "@/types/recommendation";

/**
 * "Recommended for you" strip rendered on the events directory page
 * (#1243). Pulls the ranked event suggestions for the signed-in user from
 * `GET /recommendations/:userId` and shows the top slice as tappable cards.
 *
 * Accessibility contract mirrors the rest of the directory:
 *  - section labelled `aria-label="personalized recommendations"`;
 *  - each card is a real link (`<a href="/events/:id">`) so keyboard
 *    traversal and screen-reader announcements "just work" without JS;
 *  - a match badge is rendered as text, never colour-only.
 */
export function RecommendationStrip() {
  const { user } = useAuth();
  const [state, setState] = useState<{
    data: RecommendationResponse | null;
    error: string | null;
  }>({ data: null, error: null });

  useEffect(() => {
    let cancelled = false;

    if (!user?.id) {
      setState({ data: null, error: null });
      return;
    }

    (async () => {
      try {
        const data = await apiClient.getRecommendations(user.id, 4);
        if (!cancelled) setState({ data, error: null });
      } catch (err) {
        if (!cancelled)
          setState({
            data: null,
            error: err instanceof Error ? err.message : "Unable to load recommendations",
          });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!user?.id) return null;
  if (!state.data || state.data.recommendations.length === 0) return null;

  announceCartUpdate(`${state.data.recommendations.length} personalised events`);

  return (
    <aside
      aria-label="personalized recommendations"
      className="mb-8 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
          Recommended for you
        </h2>
        <span className="text-[11px] text-gray-500 uppercase tracking-wider">
          {state.data.recommendations.length} suggestions · score match
        </span>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {state.data.recommendations.map((rec: RecommendationDto) => (
          <li key={rec.eventId}>
            <Link
              href={`/events/${rec.eventId}`}
              className="group block rounded-xl border border-white/[0.06] bg-white/[0.04] p-4 hover:border-cyan-500/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-white truncate group-hover:text-cyan-300">
                    {rec.title}
                  </h3>
                  <p className="mt-1 text-xs text-gray-500">
                    {rec.category && (
                      <span className="text-cyan-400/80">{rec.category}</span>
                    )}
                    {rec.category && rec.location && (
                      <span className="mx-1 text-gray-700">·</span>
                    )}
                    {rec.location && <span>{rec.location}</span>}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-300">
                  {(rec.score * 100).toFixed(0)}% match
                </span>
              </div>
              {rec.reason && (
                <p className="mt-2 text-xs text-gray-500">{rec.reason}</p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
