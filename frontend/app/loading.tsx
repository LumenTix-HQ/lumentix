"use client";

export default function Loading() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-black text-white">
      <div className="relative w-24 h-24">
        <div className="absolute inset-0 border-4 border-white/10 rounded-full"></div>
        <div className="absolute inset-0 border-4 border-transparent border-t-white rounded-full animate-spin"></div>
        <div className="absolute inset-0 border-4 border-transparent border-b-blue-500 rounded-full animate-spin-slow"></div>
      </div>
      <p className="mt-8 font-mono text-sm text-gray-500 animate-pulse tracking-widest">
        SYNCING WITH STELLAR NETWORK...
      </p>
      <style jsx>{`
        .animate-spin-slow {
          animation: spin 3s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  );
}
