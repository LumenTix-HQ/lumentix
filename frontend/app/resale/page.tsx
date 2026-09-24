"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import type {
  ResaleMarketplaceListing,
  ResaleMarketplaceResponse,
} from "@/types/resale";

type FraudHoldStatus = "held" | "purchased";

export default function ResaleMarketplacePage() {
  const [listings, setListings] = useState<ResaleMarketplaceListing[]>([]);
  const [pagination, setPagination] = useState<Pick<ResaleMarketplaceResponse, "page" | "totalPages" | "total">>({
    page: 1,
    totalPages: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [transactionHash, setTransactionHash] = useState("");
  const [purchaseResult, setPurchaseResult] = useState<
    { listing: ResaleMarketplaceListing; outcome: FraudHoldStatus; message: string } | null
  >(null);

  const loadPage = useCallback(async (page: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getResaleMarketplace({ page: String(page), limit: "20" });
      setListings(data.data ?? []);
      setPagination({ page: data.page, totalPages: data.totalPages, total: data.total });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the resale marketplace.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPage(1);
  }, [loadPage]);

  const startBuy = (listing: ResaleMarketplaceListing) => {
    setPurchaseResult(null);
    setTransactionHash("");
    setBuyingId(listing.ticketId);
  };

  const buy = async (listing: ResaleMarketplaceListing) => {
    setBuyingId(listing.ticketId);
    setError(null);
    try {
      await apiClient.buyResaleTicket(listing.ticketId, { transactionHash });
      setPurchaseResult({
        listing,
        outcome: "purchased",
        message: "Ticket purchased — it was added to your tickets.",
      });
      setListings((prev) => prev.filter((l) => l.ticketId !== listing.ticketId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Purchase failed.";
      // The backend holds high-risk trades for fraud review before payment
      // settles (resale.service.buyResaleTicket throws 403). Surface that
      // distinctly instead of a generic failure.
      const held = /held for fraud review|fraud review/i.test(message);
      setPurchaseResult({
        listing,
        outcome: held ? "held" : "purchased",
        message: held
          ? "Your purchase is under review. It was held by our fraud-detection system and will be resolved shortly — no action needed."
          : message,
      });
    } finally {
      setBuyingId(null);
    }
  };

  return (
    <main className="min-h-screen bg-[#060609] text-white">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-indigo-600/[0.04] rounded-full blur-[150px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-purple-600/[0.03] rounded-full blur-[130px]" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-16">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold mb-2">Resale Marketplace</h1>
          <p className="text-gray-500 text-sm">
            Verified tickets resold by other attendees, priced at most 150% of face value.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl bg-red-900/30 border border-red-700 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 h-36 animate-pulse" />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4" aria-hidden="true">🎟️</div>
            <p className="text-gray-400 mb-2 font-medium">Nothing listed right now</p>
            <p className="text-sm text-gray-600 mb-6">Tickets put up for resale will appear here.</p>
            <Link
              href="/my-tickets"
              className="inline-block rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 text-sm font-medium transition-colors"
            >
              Look at my tickets
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {listings.map((listing) => (
                <div
                  key={listing.ticketId}
                  className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-white font-semibold text-base">{listing.eventTitle}</h3>
                      <p className="text-xs text-gray-500 mt-1">
                        {listing.eventDate
                          ? new Date(listing.eventDate).toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })
                          : "Date TBA"}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-white whitespace-nowrap">
                      {listing.askPrice.toLocaleString()} {listing.currency}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">
                    Sold by <span className="text-gray-400">{listing.sellerDisplayName}</span>
                  </p>

                  {buyingId === listing.ticketId ? (
                    <div className="space-y-2">
                      <label className="block text-xs text-gray-400">
                        Stellar transaction hash (payment to the seller)
                        <input
                          type="text"
                          value={transactionHash}
                          onChange={(e) => setTransactionHash(e.target.value)}
                          placeholder="abc…"
                          className="mt-1 w-full rounded-lg bg-gray-900 border border-gray-700 text-white px-3 py-2 text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setBuyingId(null)}
                          className="flex-1 py-2 rounded-lg border border-gray-700 text-gray-400 hover:text-white text-sm font-medium transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={!transactionHash.trim()}
                          onClick={() => buy(listing)}
                          className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                        >
                          Confirm purchase
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startBuy(listing)}
                      className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
                    >
                      Buy resale ticket
                    </button>
                  )}
                </div>
              ))}
            </div>

            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-8">
                <button
                  type="button"
                  disabled={pagination.page <= 1 || loading}
                  onClick={() => loadPage(pagination.page - 1)}
                  className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 hover:text-white disabled:opacity-50 text-sm font-medium transition-colors"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-500">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  type="button"
                  disabled={pagination.page >= pagination.totalPages || loading}
                  onClick={() => loadPage(pagination.page + 1)}
                  className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 hover:text-white disabled:opacity-50 text-sm font-medium transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}

        {purchaseResult && (
          <div
            className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4`}
            onClick={() => setPurchaseResult(null)}
          >
            <div
              className={`w-full max-w-md rounded-2xl border p-6 bg-gray-900 ${
                purchaseResult.outcome === "held"
                  ? "border-yellow-600"
                  : "border-emerald-700"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3 mb-3">
                <div
                  className={`w-10 h-10 flex items-center justify-center rounded-full text-lg shrink-0 ${
                    purchaseResult.outcome === "held" ? "bg-yellow-500/20" : "bg-emerald-500/20"
                  }`}
                  aria-hidden="true"
                >
                  {purchaseResult.outcome === "held" ? "🕓" : "✓"}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {purchaseResult.outcome === "held"
                      ? "Purchase held for review"
                      : "Purchase confirmed"}
                  </h3>
                  <p className="text-sm text-gray-400">{purchaseResult.message}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPurchaseResult(null)}
                className="mt-4 w-full py-2.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}