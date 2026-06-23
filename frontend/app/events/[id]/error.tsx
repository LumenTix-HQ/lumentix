'use client';

import { useEffect } from 'react';
import Link from 'next/link';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function EventDetailError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log the error to console in development
    console.error('Event Detail Error Boundary caught an error:', error);
    
    // Optional: Send to error tracking service
    // if (process.env.NODE_ENV === 'production') {
    //   // Sentry.captureException(error);
    //   console.log('Error logged to tracking service');
    // }
  }, [error]);

  return (
    <div className="min-h-[60vh] bg-[#060609] text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Error Icon */}
        <div className="mx-auto w-16 h-16 bg-purple-500/10 border border-purple-500/20 rounded-full flex items-center justify-center">
          <svg
            className="w-8 h-8 text-purple-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        {/* Error Message */}
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
            Event Not Available
          </h2>
          <p className="text-gray-400 text-sm">
            We couldn't load this event. The event may have been removed or there's a connection issue.
          </p>
        </div>

        {/* Error Details (Development Only) */}
        {process.env.NODE_ENV === 'development' && error && (
          <div className="bg-black/40 border border-white/10 rounded-lg p-4 text-left">
            <p className="text-xs text-gray-500 mb-2 font-mono">Error Details (Development):</p>
            <p className="text-xs text-purple-400 font-mono break-all">
              {error.message || 'Unknown error'}
            </p>
            {error.digest && (
              <p className="text-xs text-gray-600 font-mono mt-2">
                Digest: {error.digest}
              </p>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
          <button
            onClick={() => reset()}
            className="px-6 py-3 bg-white text-black rounded-lg font-semibold hover:bg-gray-200 transition-colors shadow-lg"
          >
            Try Again
          </button>
          <Link
            href="/events"
            className="px-6 py-3 bg-white/[0.06] border border-white/[0.1] text-white rounded-lg font-semibold hover:bg-white/[0.1] transition-colors text-center"
          >
            Browse All Events
          </Link>
        </div>
      </div>
    </div>
  );
}
