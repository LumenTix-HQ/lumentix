'use client';

import { useState, useEffect } from 'react';
import { getAnalyticsOptOut, setAnalyticsOptOut } from '@/lib/analytics/analytics';

function AnalyticsOptOut() {
  const [optOut, setOptOut] = useState(false);
  useEffect(() => { setOptOut(getAnalyticsOptOut()); }, []);

  const toggle = () => {
    const next = !optOut;
    setOptOut(next);
    setAnalyticsOptOut(next);
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
      <h2 className="text-white font-semibold mb-4">Privacy</h2>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-white text-sm font-medium">Analytics opt-out</p>
          <p className="text-gray-500 text-xs mt-1">
            Cookie-free, privacy-respecting usage analytics. Disable to stop all tracking.
          </p>
        </div>
        <button
          onClick={toggle}
          aria-label={optOut ? 'Enable analytics' : 'Disable analytics'}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${optOut ? 'bg-gray-700' : 'bg-blue-600'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${optOut ? 'translate-x-1' : 'translate-x-6'}`} />
        </button>
      </div>
      <p className="text-xs text-gray-600 mt-3">
        {optOut ? 'Analytics disabled — no data is collected.' : 'Analytics enabled (no cookies set).'}
      </p>
    </div>
  );
}

export default function ProfilePage() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gradient-to-bl from-black via-gray-900 to-blue-950 text-white">
            <div className="z-10 max-w-4xl w-full font-mono text-sm">
                <div className="flex flex-col items-center mb-12">
                    <div className="w-32 h-32 bg-gradient-to-br from-blue-500 to-teal-500 rounded-full mb-4 shadow-xl shadow-blue-500/20 border-4 border-white/10"></div>
                    <h1 className="text-4xl font-extrabold text-white mb-2">Stellar Traveler</h1>
                    <p className="text-blue-400">GC7X...R4T2</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                    <div className="p-6 bg-white/5 border border-white/10 rounded-2xl text-center backdrop-blur-sm">
                        <div className="text-3xl font-bold text-blue-400">12</div>
                        <div className="text-xs text-gray-500 mt-1 uppercase tracking-widest">Events Attended</div>
                    </div>
                    <div className="p-6 bg-white/5 border border-white/10 rounded-2xl text-center backdrop-blur-sm">
                        <div className="text-3xl font-bold text-teal-400">5</div>
                        <div className="text-xs text-gray-500 mt-1 uppercase tracking-widest">Events Hosted</div>
                    </div>
                    <div className="p-6 bg-white/5 border border-white/10 rounded-2xl text-center backdrop-blur-sm">
                        <div className="text-3xl font-bold text-pink-400">250</div>
                        <div className="text-xs text-gray-500 mt-1 uppercase tracking-widest">Total Lumens</div>
                    </div>
                </div>

                <h2 className="text-2xl font-bold mb-6 border-b border-white/10 pb-2">My Registered Events</h2>
                <div className="space-y-4">
                    <div className="p-4 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between hover:bg-white/10 transition-colors">
                        <div>
                            <div className="font-bold">Stellar Workshop</div>
                            <div className="text-xs text-gray-500">March 15, 2026</div>
                        </div>
                        <div className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-xs font-bold border border-blue-500/30">
                            Registered
                        </div>
                    </div>
                </div>
                <AnalyticsOptOut />
            </div>
        </main>
    );
}
