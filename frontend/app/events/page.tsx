export default function EventsPage() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gradient-to-br from-black via-gray-900 to-indigo-950 text-white">
            <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
                <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400 text-center mb-8">
                    Upcoming Events
                </h1>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="p-6 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-sm transition-all hover:bg-white/10">
                        <h2 className="text-xl font-bold mb-2">Stellar Workshop</h2>
                        <p className="text-gray-400">Learn how to build on Stellar blockchain.</p>
                    </div>
                    <div className="p-6 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-sm transition-all hover:bg-white/10">
                        <h2 className="text-xl font-bold mb-2">Lumentix Hackathon</h2>
                        <p className="text-gray-400">Join our first community hackathon.</p>
                    </div>
                    <div className="p-6 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-sm transition-all hover:bg-white/10">
                        <h2 className="text-xl font-bold mb-2">Web3 Meetup</h2>
                        <p className="text-gray-400">Networking event for blockchain enthusiasts.</p>
                    </div>
                </div>
            </div>
        </main>
    );
}
