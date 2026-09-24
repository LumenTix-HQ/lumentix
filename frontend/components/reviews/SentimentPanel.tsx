"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import type { EventSentiment, SentimentLabel } from "@/types/review";

const LABEL_STYLES: Record<SentimentLabel, { bg: string; text: string; ring: string }> = {
  positive: { bg: "bg-emerald-500/10", text: "text-emerald-400", ring: "border-emerald-500/30" },
  negative: { bg: "bg-red-500/10", text: "text-red-400", ring: "border-red-500/30" },
  neutral: { bg: "bg-gray-500/10", text: "text-gray-300", ring: "border-gray-500/30" },
  mixed: { bg: "bg-yellow-500/10", text: "text-yellow-400", ring: "border-yellow-500/30" },
};

function sentimentLabel(score: number): SentimentLabel {
  if (score > 0.2) return "positive";
  if (score < -0.2) return "negative";
  if (score === 0) return "neutral";
  return "mixed";
}

function ThemeChips({
  themes,
  tone,
}: {
  themes: Array<{ theme: string; mentions: number; score: number }>;
  tone: "praise" | "complaint";
}) {
  const toneStyles =
    tone === "praise"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      : "border-red-500/30 bg-red-500/10 text-red-300";
  return (
    <div className="flex flex-wrap gap-2">
      {themes.map((t) => (
        <span
          key={t.theme}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs ${toneStyles}`}
        >
          {t.theme}
          <span className="opacity-60">({t.mentions})</span>
        </span>
      ))}
    </div>
  );
}

export function SentimentPanel({ eventId }: { eventId: string }) {
  const [sentiment, setSentiment] = useState<EventSentiment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alert, setAlert] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSentiment(null);
    setError(null);
    setAlert(false);

    if (!eventId.trim()) return;

    (async () => {
      try {
        const data = await apiClient.getEventSentiment(eventId.trim());
        if (!cancelled) setSentiment(data);
        // Fewer than 3 reviews analysed means the backend could not produce a
        // meaningful summary; show a gentle notice rather than a wrong signal.
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load sentiment.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (!eventId.trim()) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Event Sentiment</h2>
        <span className="text-[11px] text-gray-600 uppercase tracking-wider font-medium">
          powered by review analysis
        </span>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {!error && !sentiment && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <div className="h-4 w-1/3 rounded bg-white/[0.06] animate-pulse mb-3" />
          <div className="h-3 w-1/2 rounded bg-white/[0.06] animate-pulse" />
        </div>
      )}

      {!error && sentiment && sentiment.reviewsAnalysed === 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-5 text-sm text-gray-400">
          No reviews have been analysed for this event yet. Sentiment appears once
          attendees have submitted reviews.
        </div>
      )}

      {!error && sentiment && sentiment.reviewsAnalysed > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
            <div
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-semibold ${
                LABEL_STYLES[sentimentLabel(sentiment.aggregateScore)].bg
              } ${
                LABEL_STYLES[sentimentLabel(sentiment.aggregateScore)].text
              } ${
                LABEL_STYLES[sentimentLabel(sentiment.aggregateScore)].ring
              }`}
            >
              {sentimentLabel(sentiment.aggregateScore)}
              <span className="opacity-60 text-xs font-normal">
                {sentiment.aggregateScore.toFixed(2)} / {sentiment.reviewsAnalysed} reviews
              </span>
            </div>
            {sentiment.averageRating !== null && (
              <p className="text-xs text-gray-500">
                Average rating:{" "}
                <span className="text-gray-300 font-medium">
                  {sentiment.averageRating.toFixed(1)} / 5
                </span>
              </p>
            )}
            <button
              type="button"
              onClick={() => setAlert((v) => !v)}
              className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-white/[0.08] text-gray-400 hover:text-white transition-colors"
              aria-expanded={alert}
            >
              {alert ? "Hide distribution" : "Show distribution"}
            </button>
          </div>

          {alert && (
            <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.entries(sentiment.distribution).map(([label, count]) => (
                <div key={label} className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-gray-600">{label}</div>
                  <div className="text-sm font-semibold text-white">{count}</div>
                </div>
              ))}
            </div>
          )}

          <p className="text-sm text-gray-300 leading-relaxed mb-4">{sentiment.summary}</p>

          {sentiment.commonPraise.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-emerald-400 font-medium mb-1.5">Common praise</p>
              <ThemeChips themes={sentiment.commonPraise} tone="praise" />
            </div>
          )}
          {sentiment.commonComplaints.length > 0 && (
            <div>
              <p className="text-xs text-red-400 font-medium mb-1.5">Common complaints</p>
              <ThemeChips themes={sentiment.commonComplaints} tone="complaint" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}