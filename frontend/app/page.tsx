import Link from 'next/link';

const FEATURES = [
  {
    icon: '🎟️',
    title: 'Blockchain Tickets',
    desc: 'Every ticket is cryptographically signed and verified on the Stellar network.',
    href: '/events',
    cta: 'Browse Events',
    gradient: 'from-blue-500/20 to-indigo-500/20',
    border: 'border-blue-500/20',
  },
  {
    icon: '🛡️',
    title: 'Event Insurance',
    desc: 'Pay 10% premium for full refund protection if your event is cancelled.',
    href: '/insurance',
    cta: 'Get Insured',
    gradient: 'from-emerald-500/20 to-teal-500/20',
    border: 'border-emerald-500/20',
  },
  {
    icon: '⭐',
    title: 'Verified Reviews',
    desc: 'Only real attendees can review. Attendance is proven on-chain — no fake reviews.',
    href: '/reviews',
    cta: 'See Reviews',
    gradient: 'from-yellow-500/20 to-orange-500/20',
    border: 'border-yellow-500/20',
  },
  {
    icon: '✨',
    title: 'Create Events',
    desc: 'Launch your event with escrow payments, VIP tiers, and sponsor management.',
    href: '/create',
    cta: 'Create Now',
    gradient: 'from-purple-500/20 to-pink-500/20',
    border: 'border-purple-500/20',
  },
  {
    icon: '🏆',
    title: 'Achievements',
    desc: 'Earn XP, unlock badges, complete challenges, and climb the leaderboard.',
    href: '/gamification',
    cta: 'View Badges',
    gradient: 'from-yellow-500/20 to-orange-500/20',
    border: 'border-yellow-500/20',
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#060609] text-white">
      {/* Ambient background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-60 -left-60 w-[700px] h-[700px] bg-blue-600/[0.05] rounded-full blur-[180px]" />
        <div className="absolute top-1/2 -right-40 w-[500px] h-[500px] bg-indigo-600/[0.04] rounded-full blur-[150px]" />
        <div className="absolute -bottom-40 left-1/3 w-[400px] h-[400px] bg-purple-600/[0.03] rounded-full blur-[130px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-20">
        {/* Hero */}
        <div className="text-center mb-20">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Built on Stellar
          </div>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 mb-6 leading-tight">
            Lumentix
          </h1>
          <p className="text-gray-400 text-lg sm:text-xl max-w-2xl mx-auto mb-10">
            The decentralized event platform where every ticket, payment, review, and insurance policy lives on the blockchain.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/events"
              className="px-8 py-3.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors"
            >
              Discover Events
            </Link>
            <Link
              href="/create"
              className="px-8 py-3.5 rounded-full border border-white/[0.15] hover:border-white/[0.3] text-gray-300 hover:text-white font-semibold transition-colors"
            >
              Host an Event
            </Link>
          </div>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map(f => (
            <Link key={f.title} href={f.href} className="group">
              <div className={`h-full bg-gradient-to-br ${f.gradient} border ${f.border} rounded-2xl p-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl`}>
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="text-base font-bold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-gray-400 mb-4 leading-relaxed">{f.desc}</p>
                <span className="text-xs font-semibold text-white/70 group-hover:text-white transition-colors">
                  {f.cta} →
                </span>
              </div>
            </Link>
          ))}
        </div>

        {/* Stats strip */}
        <div className="mt-20 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {[
            { value: 'Stellar', label: 'Blockchain' },
            { value: '10%', label: 'Insurance Premium' },
            { value: '100%', label: 'Verified Reviews' },
            { value: '0 Fake', label: 'Tickets Possible' },
          ].map(s => (
            <div key={s.label}>
              <div className="text-2xl font-bold text-white">{s.value}</div>
              <div className="text-xs text-gray-600 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
