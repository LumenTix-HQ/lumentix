import { Suspense } from 'react';
import Link from 'next/link';
import CategoryCard from '@/components/CategoryCard';

// This data would normally come from an API call
const CATEGORIES = [
  { slug: 'conference', name: 'Conferences', description: 'Industry gatherings, summits, and professional conferences', eventCount: 12 },
  { slug: 'workshop', name: 'Workshops', description: 'Hands-on learning sessions and skill-building events', eventCount: 8 },
  { slug: 'meetup', name: 'Meetups', description: 'Casual community gatherings and networking events', eventCount: 15 },
  { slug: 'concert', name: 'Concerts', description: 'Live music performances and shows', eventCount: 6 },
  { slug: 'sports', name: 'Sports', description: 'Sporting events, matches, and tournaments', eventCount: 4 },
  { slug: 'festival', name: 'Festivals', description: 'Multi-day celebrations and cultural events', eventCount: 3 },
  { slug: 'other', name: 'Other', description: 'Miscellaneous events and gatherings', eventCount: 9 },
];

// Revalidate every 5 minutes (ISR)
export const revalidate = 300;

export default function CategoriesPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Browse Events by Category
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Discover events that match your interests. From conferences to concerts,
            find the perfect experience.
          </p>
        </div>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-8">
          <Link href="/" className="hover:text-gray-700 transition-colors">
            Home
          </Link>
          <span>/</span>
          <span className="text-gray-900 font-medium">Categories</span>
        </nav>

        {/* Category grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {CATEGORIES.map((category) => (
            <CategoryCard
              key={category.slug}
              slug={category.slug}
              name={category.name}
              description={category.description}
              eventCount={category.eventCount}
            />
          ))}
        </div>

        {/* Empty state (if no categories) */}
        {CATEGORIES.length === 0 && (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">No categories yet</h3>
            <p className="text-sm text-gray-500">Categories will appear once events are created.</p>
          </div>
        )}
      </div>
    </div>
  );
}
