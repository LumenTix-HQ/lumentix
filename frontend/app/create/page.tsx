export default function CreateEventPage() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gradient-to-tr from-black via-gray-900 to-purple-950 text-white">
            <div className="z-10 max-w-2xl w-full font-mono text-sm">
                <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 text-center mb-12">
                    Create New Event
                </h1>
                <div className="p-8 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-md shadow-2xl">
                    <form className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Event Title</label>
                            <input
                                type="text"
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none transition-all"
                                placeholder="Enter event title..."
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Date & Time</label>
                            <input
                                type="datetime-local"
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Description</label>
                            <textarea
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none transition-all h-32"
                                placeholder="Tell us about your event..."
                            ></textarea>
                        </div>
                        <button className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl font-bold text-lg hover:scale-[1.02] transition-transform active:scale-95 shadow-lg shadow-purple-500/20">
                            Launch Event
                        </button>
                    </form>
                </div>
            </div>
        </main>
    );
}
