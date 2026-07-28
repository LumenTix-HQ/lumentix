import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import EventCard from '@/components/events/EventCard';

// This data would come from an API in production
const CATEGORIES = [
  { slug: 'conference', name: 'Conferences', description: 'Industry gatherings, summits, and professional conferences' },
  { slug: 'workshop', name: 'Workshops', description: 'Hands-on learning sessions and skill-building events' },
  { slug: 'meetup', name: 'Meetups', description: 'Casual community gatherings and networking events' },
  { slug: 'concert', name: 'Concerts', description: 'Live music performances and shows' },
  { slug: 'sports', name: 'Sports', description: 'Sporting events, matches, and tournaments' },
  { slug: 'festival', name: 'Festivals', description: 'Multi-day celebrations and cultural events' },
  { slug: 'other', name: 'Other', description: 'Miscellaneous events and gatherings' },
];

// Mock events data
const MOCK_EVENTS = [
  {
    id: '1',
    title: 'Tech Summit 2025',
    description: 'Annual technology conference',
    date: '2025-09-15',
    location: 'San Francisco, CA',
    price: 299,
    currency: 'USD',
    image: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400',
    category: 'conference',
  },
  {
    id: '2',
    title: 'Design Workshop',
    description: 'UI/UX design fundamentals',
    date: '2025-08-20',
    location: 'New York, NY',
    price: 149,
    currency: 'USD',
    image: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=400',
    category: 'workshop',
  },
];

// Revalidate every 5 minutes
export const revalidate = 300;

export function generateStaticParams() {
  return CATEGORIES.map((cat) => ({ slug: cat.slug }));
}

interface Props {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ page?: string }>;
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const category = CATEGORIES.find((c) => c.slug === slug);

  if (!category) {
    notFound();
  }

  const events = MOCK_EVENTS.filter((e) => e.category === slug);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
          <Link href="/" className="hover:text-gray-700 transition-colors">
            Home
          </Link>
          <span>/</span>
          <Link href="/categories" className="hover:text-gray-700 transition-colors">
            Categories
          </Link>
          <span>/</span>
          <span className="text-gray-900 font-medium">{category.name}</span>
        </nav>

        {/* Category header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{category.name}</h1>
          <p className="text-gray-600">{category.description}</p>
          <p className="text-sm text-gray-500 mt-2">
            {events.length} {events.length === 1 ? 'event' : 'events'} found
          </p>
        </div>

        {/* Events grid */}
        {events.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
              />
            ))}
          </div>
        ) : (
          /* Empty state */
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">
              No events in this category yet
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Check back later for upcoming {category.name.toLowerCase()}.
            </p>
            <Link
              href="/categories"
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
            >
              Browse other categories
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
