'use client';

import { useEffect, useCallback } from 'react';
import type { Event } from '@/types/event';

// Placeholder text for unfilled fields
const PLACEHOLDER_TEXT = '[Not provided]';

interface EventFormValues {
  title: string;
  description: string;
  location: string;
  startDate: string;
  endDate: string;
  ticketPrice: number;
  currency: string;
  category: string;
  maxAttendees: number | null;
  imageUrl: string;
}

interface EventPreviewOverlayProps {
  formValues: EventFormValues;
  onClose: () => void;
  onSubmit: () => void;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return PLACEHOLDER_TEXT;
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return PLACEHOLDER_TEXT;
  }
}

export default function EventPreviewOverlay({
  formValues,
  onClose,
  onSubmit,
}: EventPreviewOverlayProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  const hasUnfilled = Object.values(formValues).some(
    (v) => v === '' || v === null || v === undefined,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Event Preview</h2>
            {hasUnfilled && (
              <p className="text-sm text-amber-600 mt-0.5">
                ⚠️ Preview uses placeholder data for unfilled fields
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close preview"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Preview content */}
        <div className="p-6 space-y-6">
          {/* Image */}
          <div className="aspect-video bg-gradient-to-br from-indigo-100 to-purple-100 rounded-xl overflow-hidden">
            {formValues.imageUrl ? (
              <img
                src={formValues.imageUrl}
                alt={formValues.title || 'Event preview'}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg className="w-12 h-12 text-indigo-300" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                </svg>
              </div>
            )}
          </div>

          {/* Title & Category */}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {formValues.title || PLACEHOLDER_TEXT}
            </h1>
            {formValues.category && (
              <span className="mt-1 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                {formValues.category}
              </span>
            )}
          </div>

          {/* Description */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">Description</h3>
            <p className="text-gray-700 whitespace-pre-wrap">
              {formValues.description || PLACEHOLDER_TEXT}
            </p>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Date</p>
              <p className="text-sm font-medium text-gray-900">{formatDate(formValues.startDate)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">End Date</p>
              <p className="text-sm font-medium text-gray-900">{formatDate(formValues.endDate)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Location</p>
              <p className="text-sm font-medium text-gray-900">{formValues.location || PLACEHOLDER_TEXT}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Price</p>
              <p className="text-sm font-medium text-gray-900">
                {formValues.ticketPrice > 0
                  ? `${formValues.ticketPrice} ${formValues.currency || 'XLM'}`
                  : 'Free'}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex items-center justify-end gap-3 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
          >
            Back to editing
          </button>
          <button
            onClick={onSubmit}
            className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
          >
            Submit Event
          </button>
        </div>
      </div>
    </div>
  );
}
