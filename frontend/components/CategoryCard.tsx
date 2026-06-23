'use client';

import Link from 'next/link';

interface CategoryCardProps {
  slug: string;
  name: string;
  description?: string;
  eventCount: number;
  icon?: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  conference: '🎤',
  workshop: '🔧',
  meetup: '🤝',
  concert: '🎵',
  sports: '⚽',
  festival: '🎪',
  other: '📋',
};

export default function CategoryCard({
  slug,
  name,
  description,
  eventCount,
  icon,
}: CategoryCardProps) {
  const emoji = icon || CATEGORY_ICONS[slug.toLowerCase()] || '📋';

  return (
    <Link
      href={`/categories/${slug}`}
      className="group relative flex flex-col rounded-xl border border-gray-200 bg-white p-6 transition-all hover:shadow-lg hover:border-indigo-200 hover:-translate-y-0.5"
    >
      <div className="flex items-center gap-3 mb-3">
        <span className="text-2xl" role="img" aria-label={name}>
          {emoji}
        </span>
        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
          {name}
        </h3>
      </div>

      {description && (
        <p className="text-sm text-gray-500 mb-4 line-clamp-2">{description}</p>
      )}

      <div className="mt-auto flex items-center justify-between">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
          {eventCount} {eventCount === 1 ? 'event' : 'events'}
        </span>
        <span className="text-sm font-medium text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
          Browse &rarr;
        </span>
      </div>
    </Link>
  );
}
