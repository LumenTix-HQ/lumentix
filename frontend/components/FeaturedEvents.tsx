import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

async function getFeaturedEvents() {
  try {
    const res = await fetch(`${API_BASE}/events?status=published&limit=6`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.data ?? []);
  } catch {
    return [];
  }
}

export default async function FeaturedEvents() {
  const events = await getFeaturedEvents();

  return (
    <section className="py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">Upcoming Events</h2>
        {events.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            No upcoming events yet.{' '}
            <Link href="/create" className="text-blue-400 hover:underline">
              Create the first one!
            </Link>
          </p>
        ) : (
          <div className="flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide">
            {events.map((event: any) => (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className="snap-start flex-none w-64 bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:border-blue-500/30 hover:bg-white/8 transition-all duration-200 group"
              >
                {event.imageUrl ? (
                  <img
                    src={event.imageUrl}
                    alt={event.title}
                    className="w-full h-36 object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-36 bg-gradient-to-br from-blue-600/30 to-indigo-600/30" />
                )}
                <div className="p-4">
                  <h3 className="font-semibold text-white truncate text-sm">{event.title}</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(event.startDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                  <p className="text-xs font-bold text-blue-400 mt-2">
                    {Number(event.ticketPrice) === 0 ? 'Free' : `${event.ticketPrice} ${event.currency}`}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
        <div className="text-center mt-8">
          <Link
            href="/events"
            className="inline-block px-6 py-2.5 rounded-full border border-white/20 text-gray-300 hover:text-white hover:border-white/40 text-sm font-medium transition-colors"
          >
            View all events →
          </Link>
        </div>
      </div>
    </section>
  );
}
