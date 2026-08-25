'use client';

import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function SegmentError({ error, reset }: ErrorProps) {
  useEffect(() => { console.error('Segment Error:', error); }, [error]);

  return (
    <div className="min-h-[60vh] bg-[#060609] text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400">Something Went Wrong</h2>
        <p className="text-gray-400 text-sm">An unexpected error occurred. Please try again.</p>
        <div className="flex gap-3 justify-center pt-2">
          <button onClick={() => reset()} className="px-5 py-2.5 bg-white text-black rounded-lg font-semibold hover:bg-gray-200 transition-colors text-sm">Try Again</button>
          <a href="/" className="px-5 py-2.5 bg-white/[0.06] border border-white/[0.1] text-white rounded-lg font-semibold hover:bg-white/[0.1] transition-colors text-sm">Go Home</a>
        </div>
      </div>
    </div>
  );
}
