'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { EventReview, ReviewStatus, ReputationScore, PaginatedReviews } from '@/types/review';

function getToken(): string {
  return typeof window !== 'undefined'
    ? localStorage.getItem('lumentix_access_token') ?? ''
    : '';
}

// ── Star rating display ───────────────────────────────────────────────────────

function Stars({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'lg' }) {
  const sz = size === 'lg' ? 'w-5 h-5' : 'w-3.5 h-3.5';
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <svg
          key={n}
          className={`${sz} ${n <= rating ? 'text-yellow-400' : 'text-gray-700'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<ReviewStatus, string> = {
  [ReviewStatus.PENDING]:  'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  [ReviewStatus.VERIFIED]: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  [ReviewStatus.REJECTED]: 'bg-red-500/15 text-red-400 border-red-500/30',
  [ReviewStatus.FLAGGED]:  'bg-orange-500/15 text-orange-400 border-orange-500/30',
};

// ── Review card ───────────────────────────────────────────────────────────────

function ReviewCard({ review }: { review: EventReview }) {
  const badge = STATUS_STYLES[review.status];
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <Stars rating={review.rating} />
          <div className="text-xs text-gray-600 mt-1 font-mono">
            Event: {review.eventId.slice(0, 8)}…
          </div>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border flex-shrink-0 ${badge}`}>
          {review.status}
        </span>
      </div>

      {review.comment && (
        <p className="text-sm text-gray-300 leading-relaxed mb-3 line-clamp-3">
          {review.comment}
        </p>
      )}

      <div className="flex items-center justify-between text-[11px] text-gray-600">
        <span>{new Date(review.createdAt).toLocaleDateString()}</span>
        {review.attendanceVerified && (
          <span className="flex items-center gap-1 text-emerald-500">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Attendance verified
          </span>
        )}
      </div>
    </div>
  );
}

// ── Reputation panel ──────────────────────────────────────────────────────────

function ReputationPanel({ rep }: { rep: ReputationScore }) {
  const bars = [5, 4, 3, 2, 1];
  const max = Math.max(...Object.values(rep.ratingDistribution).map(Number), 1);

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-6">
      <h3 className="text-base font-semibold text-white mb-4">Organizer Reputation</h3>

      {/* Score ring */}
      <div className="flex items-center gap-6 mb-6">
        <div className="relative w-20 h-20 flex-shrink-0">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
            <circle
              cx="18" cy="18" r="15.9" fill="none"
              stroke="url(#repGrad)" strokeWidth="3"
              strokeDasharray={`${rep.reputationScore} 100`}
              strokeLinecap="round"
            />
            <defs>
              <linearGradient id="repGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="100%" stopColor="#818cf8" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold text-white">{rep.reputationScore.toFixed(0)}</span>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <Stars rating={Math.round(rep.averageRating)} size="lg" />
            <span className="text-white font-bold">{rep.averageRating.toFixed(1)}</span>
          </div>
          <div className="text-sm text-gray-500">{rep.totalReviews} verified reviews</div>
        </div>
      </div>

      {/* Distribution bars */}
      <div className="space-y-1.5">
        {bars.map(star => {
          const count = Number(rep.ratingDistribution[String(star)] ?? 0);
          const pct = max > 0 ? (count / max) * 100 : 0;
          return (
            <div key={star} className="flex items-center gap-2 text-xs">
              <span className="text-gray-500 w-3">{star}</span>
              <svg className="w-3 h-3 text-yellow-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full rounded-full bg-yellow-400/50 transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-gray-600 w-4 text-right">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Submit review form ────────────────────────────────────────────────────────

function SubmitReviewForm({ onSuccess }: { onSuccess: () => void }) {
  const [eventId, setEventId] = useState('');
  const [ticketId, setTicketId] = useState('');
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [hovered, setHovered] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventId.trim() || !ticketId.trim()) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await apiClient.submitReview(
        { eventId: eventId.trim(), ticketId: ticketId.trim(), rating, comment: comment || undefined },
        getToken(),
      );
      setSuccess('Review submitted and attendance verified!');
      setEventId(''); setTicketId(''); setComment(''); setRating(5);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit review.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-6 mb-8">
      <h3 className="text-base font-semibold text-white mb-1">Submit a Review</h3>
      <p className="text-sm text-gray-500 mb-5">
        Only verified attendees (checked-in tickets) can submit reviews.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Event UUID</label>
          <input
            value={eventId}
            onChange={e => setEventId(e.target.value)}
            placeholder="550e8400-…"
            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-500/50"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Ticket UUID</label>
          <input
            value={ticketId}
            onChange={e => setTicketId(e.target.value)}
            placeholder="550e8400-…"
            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-500/50"
          />
        </div>
      </div>

      {/* Star picker */}
      <div className="mb-4">
        <label className="block text-xs text-gray-400 mb-2">Rating</label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              type="button"
              onMouseEnter={() => setHovered(n)}
              onMouseLeave={() => setHovered(0)}
              onClick={() => setRating(n)}
              className="focus:outline-none"
            >
              <svg
                className={`w-7 h-7 transition-colors ${n <= (hovered || rating) ? 'text-yellow-400' : 'text-gray-700'}`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </button>
          ))}
          <span className="ml-2 text-sm text-gray-400">{rating} / 5</span>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-xs text-gray-400 mb-1.5">Comment (optional)</label>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Share your experience…"
          className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-500/50 resize-none"
        />
        <div className="text-right text-[11px] text-gray-600 mt-1">{comment.length}/2000</div>
      </div>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
      {success && <p className="mb-3 text-sm text-emerald-400">{success}</p>}

      <button
        type="submit"
        disabled={loading || !eventId.trim() || !ticketId.trim()}
        className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-60 transition-colors"
      >
        {loading ? 'Submitting…' : 'Submit Review'}
      </button>
    </form>
  );
}

// ── Reputation lookup ─────────────────────────────────────────────────────────

function ReputationLookup() {
  const [orgId, setOrgId] = useState('');
  const [rep, setRep] = useState<ReputationScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getOrganizerReputation(orgId.trim(), getToken()) as ReputationScore;
      setRep(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Not found.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-white mb-4">Organizer Reputation Lookup</h2>
      <form onSubmit={lookup} className="flex gap-3 mb-4">
        <input
          value={orgId}
          onChange={e => setOrgId(e.target.value)}
          placeholder="Organizer UUID"
          className="flex-1 bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-500/50"
        />
        <button
          type="submit"
          disabled={loading || !orgId.trim()}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-60 transition-colors"
        >
          {loading ? 'Looking up…' : 'Look Up'}
        </button>
      </form>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {rep && <ReputationPanel rep={rep} />}
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function ReviewsPage() {
  const [myReviews, setMyReviews] = useState<EventReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState('');

  useEffect(() => { setToken(getToken()); }, []);

  const loadMyReviews = useCallback(async () => {
    const t = getToken();
    if (!t) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await apiClient.getMyReviews(t) as PaginatedReviews;
      setMyReviews(data.data ?? []);
    } catch { /* empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadMyReviews(); }, [loadMyReviews]);

  return (
    <main className="min-h-screen bg-[#060609] text-white">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-indigo-600/[0.04] rounded-full blur-[150px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-purple-600/[0.03] rounded-full blur-[130px]" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-16">
        <div className="mb-10">
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 mb-2">
            Event Reviews
          </h1>
          <p className="text-gray-500">
            Blockchain-verified reviews from real attendees. Fake reviews are prevented by on-chain attendance proof.
          </p>
        </div>

        {/* How it works */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          {[
            { icon: '🎟️', title: 'Attend the Event', desc: 'Your ticket must be scanned (status: used) at the door.' },
            { icon: '✍️', title: 'Submit a Review', desc: 'Rate 1–5 stars and leave an optional comment.' },
            { icon: '⛓️', title: 'Verified On-Chain', desc: 'Attendance is confirmed against the blockchain before your review goes live.' },
          ].map(step => (
            <div key={step.title} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
              <div className="text-2xl mb-2">{step.icon}</div>
              <div className="text-sm font-semibold text-white mb-1">{step.title}</div>
              <div className="text-xs text-gray-500">{step.desc}</div>
            </div>
          ))}
        </div>

        {!token ? (
          <div className="text-center py-16 text-gray-500">
            <div className="text-4xl mb-4">🔒</div>
            <p>Sign in to submit reviews and view your review history.</p>
          </div>
        ) : (
          <>
            <SubmitReviewForm onSuccess={loadMyReviews} />
            <ReputationLookup />

            <h2 className="text-lg font-semibold text-white mb-4">My Reviews</h2>
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-36 rounded-xl bg-white/[0.03] animate-pulse" />
                ))}
              </div>
            ) : myReviews.length === 0 ? (
              <div className="text-center py-12 text-gray-600">
                <div className="text-3xl mb-3">⭐</div>
                <p>No reviews yet. Attend an event and share your experience!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {myReviews.map(r => <ReviewCard key={r.id} review={r} />)}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
