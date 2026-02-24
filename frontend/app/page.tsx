import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold text-center mb-8">
          🌟 Welcome to Lumentix
        </h1>
        <p className="text-center text-lg mb-4">
          Stellar Event Platform - Event Registration with Blockchain Payments
        </p>
        <p className="text-center text-gray-500 mb-8">
          Your decentralized event management platform
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/events"
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors text-center"
          >
            Browse Events
          </Link>
          <Link
            href="/test-payment"
            className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors text-center"
          >
            Test Payment Flow
          </Link>
        </div>
      </div>
    </main>
  );
}
