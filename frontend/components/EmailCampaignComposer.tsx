'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type { CreateEmailCampaignPayload, EmailCampaign } from '@/types/email-campaign';

interface Props {
  events: { id: string; title: string }[];
  onCreated: (campaign: EmailCampaign) => void;
  onCancel: () => void;
}

const PREVIEW_PLACEHOLDER =
  '<p style="font-family:sans-serif;color:#ccc;">Your email preview will appear here…</p>';

export function EmailCampaignComposer({ events, onCreated, onCancel }: Props) {
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [eventId, setEventId] = useState<string>('');
  const [scheduledAt, setScheduledAt] = useState<string>('');
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!subject.trim()) {
      setError('Subject is required.');
      return;
    }
    if (!bodyHtml.trim()) {
      setError('Email body is required.');
      return;
    }
    setError(null);
    setSubmitting(true);

    const token = localStorage.getItem('lumentix_access_token') ?? '';
    const payload: CreateEmailCampaignPayload = {
      subject: subject.trim(),
      bodyHtml: bodyHtml.trim(),
      ...(eventId ? { eventId } : {}),
      ...(scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
    };

    try {
      const created = await apiClient.createEmailCampaign(payload, token) as EmailCampaign;
      onCreated(created);
    } catch (err: any) {
      setError(err.message ?? 'Failed to create campaign.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-700 bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
        <h3 className="text-lg font-semibold text-white">New Email Campaign</h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-gray-400 hover:text-white transition-colors text-xl leading-none"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="p-6 space-y-5">
        {error && (
          <div className="rounded-lg bg-red-900/40 border border-red-700 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Subject */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5" htmlFor="cam-subject">
            Subject line <span className="text-red-400">*</span>
          </label>
          <input
            id="cam-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="E.g. Join us for our next event!"
            className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white px-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Event filter */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5" htmlFor="cam-event">
            Target event <span className="text-gray-500">(leave blank for all past attendees)</span>
          </label>
          <select
            id="cam-event"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
          >
            <option value="">All events</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
              </option>
            ))}
          </select>
        </div>

        {/* Scheduled send */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5" htmlFor="cam-sched">
            Scheduled send time <span className="text-gray-500">(optional — leave blank to send immediately)</span>
          </label>
          <input
            id="cam-sched"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Body — edit / preview tabs */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <label className="text-xs font-medium text-gray-400">
              Email body <span className="text-red-400">*</span>
            </label>
            <div className="flex rounded-lg border border-gray-700 overflow-hidden text-xs ml-auto">
              <button
                type="button"
                onClick={() => setTab('edit')}
                className={`px-3 py-1 transition-colors ${
                  tab === 'edit'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                HTML Editor
              </button>
              <button
                type="button"
                onClick={() => setTab('preview')}
                className={`px-3 py-1 transition-colors ${
                  tab === 'preview'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                Preview
              </button>
            </div>
          </div>

          {tab === 'edit' ? (
            <textarea
              aria-label="Email HTML body"
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              rows={12}
              placeholder="<h1>Hello {{name}},</h1><p>We have exciting news for you…</p>"
              className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white px-3 py-2 text-sm font-mono placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors resize-y"
            />
          ) : (
            <div
              className="w-full min-h-[200px] rounded-lg bg-white border border-gray-600 p-4 text-sm overflow-auto"
              aria-label="Email preview"
              /* eslint-disable-next-line react/no-danger */
              dangerouslySetInnerHTML={{ __html: bodyHtml || PREVIEW_PLACEHOLDER }}
            />
          )}
          <p className="text-xs text-gray-500 mt-1">
            You can use <code className="text-indigo-400">{'{{name}}'}</code> as a placeholder for
            the attendee's name (interpolated at send time by the backend).
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-600 text-gray-300 hover:text-white hover:bg-gray-800 px-4 py-2 text-sm font-medium transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={submitting}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 text-sm font-medium transition-colors"
        >
          {submitting ? 'Creating…' : 'Save as Draft'}
        </button>
      </div>
    </div>
  );
}
