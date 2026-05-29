import { notFound } from 'next/navigation';
import EventDetailClient from '@/components/events/EventDetailClient';
import PaymentFlow from '@/components/PaymentFlow';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

async function getEvent(id: string) {
  try {
    const res = await fetch(`${API_BASE}/events/${id}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function EventDetailPage({ params }: { params: { id: string } }) {
  const event = await getEvent(params.id);
  if (!event) notFound();

  return (
    <div>
      <EventDetailClient event={event} />
      <div className="max-w-5xl mx-auto px-4 pb-10">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4 max-w-sm">
          <h2 className="text-lg font-semibold text-white">Register &amp; Pay</h2>
          <div className="text-2xl font-bold text-blue-400">
            {Number(event.ticketPrice) === 0
              ? 'Free'
              : `${event.ticketPrice} ${event.currency}`}
          </div>
          {event.maxAttendees && (
            <p className="text-sm text-gray-500">
              {event.registrationCount ?? '?'} / {event.maxAttendees} spots taken
            </p>
          )}
          <PaymentFlow
            eventId={event.id}
            ticketPrice={Number(event.ticketPrice)}
            currency={event.currency}
          />
        </div>
      </div>
    </div>
  );
}
