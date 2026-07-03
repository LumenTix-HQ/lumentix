import Link from 'next/link';

export default function SegmentNotFound() {
  return (
    <div className="min-h-[60vh] bg-[#060609] text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-yellow-500/10 border border-yellow-500/20 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-400">Page Not Found</h2>
        <p className="text-gray-400 text-sm">The page you are looking for does not exist or has been moved.</p>
        <Link href="/" className="inline-block px-5 py-2.5 bg-white text-black rounded-lg font-semibold hover:bg-gray-200 transition-colors text-sm">Go Home</Link>
      </div>
    </div>
  );
}
