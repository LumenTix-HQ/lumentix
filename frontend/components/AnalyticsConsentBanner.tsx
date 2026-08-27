'use client';

import { useEffect, useState } from 'react';
import {
  hasAnalyticsDecision,
  setAnalyticsConsent,
} from '@/lib/analytics/analytics';

/**
 * First-visit cookie/analytics consent banner. Analytics defaults to opted-out
 * (see lib/analytics/analytics.ts) until the user explicitly accepts here.
 */
export default function AnalyticsConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show the banner if the user hasn't decided yet.
    setVisible(!hasAnalyticsDecision());
  }, []);

  const decide = (decision: 'granted' | 'denied') => {
    setAnalyticsConsent(decision);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Analytics consent"
      className="fixed bottom-0 left-0 right-0 z-[9998] bg-[#0a0a0f] border-t border-white/10 px-4 py-4 sm:px-6"
    >
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6">
        <p className="text-sm text-gray-300 flex-1">
          We use privacy-friendly analytics to understand how Lumentix is used.
          No analytics data (including page URLs) is collected until you accept.
        </p>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => decide('denied')}
            className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white border border-white/15 rounded-lg transition-colors"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => decide('granted')}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
