export default function OfflinePage() {
    return (
        <main className="flex min-h-screen items-center justify-center bg-gradient-to-tr from-black via-gray-900 to-purple-950 px-6 text-white">
            <section className="max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-md">
                <h1 className="text-3xl font-extrabold">You are offline</h1>
                <p className="mt-3 text-sm text-gray-300">Lumentix cached pages remain available. Reconnect to load live event data, tickets, emergency alerts, and weather updates.</p>
                <a href="/" className="mt-6 inline-block rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-5 py-3 text-sm font-bold">Return home</a>
            </section>
        </main>
    );
}
