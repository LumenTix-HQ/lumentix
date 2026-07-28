import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-black/40 border-t border-white/5 text-gray-400 py-12 px-4">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
        <div>
          <h3 className="text-white font-bold text-lg mb-3">Lumentix</h3>
          <p className="text-sm text-gray-500 leading-relaxed">
            Decentralized event platform built on the Stellar blockchain. Transparent payments,
            verifiable tickets, no middlemen.
          </p>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-3 text-sm uppercase tracking-widest">Platform</h4>
          <ul className="space-y-2 text-sm">
            <li><Link href="/events" className="hover:text-white transition-colors">Browse Events</Link></li>
            <li><Link href="/create" className="hover:text-white transition-colors">Create Event</Link></li>
            <li><Link href="/register" className="hover:text-white transition-colors">Sign Up</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-3 text-sm uppercase tracking-widest">Community</h4>
          <ul className="space-y-2 text-sm">
            <li>
              <a
                href="https://stellar.org"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                Stellar Network
              </a>
            </li>
            <li>
              <a
                href="https://github.com/LumenTix-HQ"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                GitHub
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="max-w-6xl mx-auto mt-10 pt-8 border-t border-white/5 text-xs text-gray-600 text-center">
        © {new Date().getFullYear()} Lumentix. Open source under MIT License.
      </div>
    </footer>
  );
}
