'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { EmailCampaignComposer } from '@/components/EmailCampaignComposer';
import { EmailCampaignCard } from '@/components/EmailCampaignCard';
import type { EmailCampaign, EmailCampaignAnalytics } from '@/types/email-campaign';

function SendConfirmModal({
  open, campaign, onClose, onConfirm,
}: { open: boolean; campaign: EmailCampaign | null; onClose: () => void; onConfirm: () => void }) {
  if (!open || !campaign) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-white mb-2">Send Campaign</h3>
        <p className="text-sm text-gray-400 mb-6">
          Send <strong className="text-white">"{campaign.subject}"</strong> to{' '}
          <strong className="text-white">{campaign.recipientCount.toLocaleString()} recipient{campaign.recipientCount !== 1 ? 's' : ''}</strong>?
          This action cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 text-sm font-medium transition-colors">Keep Draft</button>
          <button type="button" onClick={onConfirm} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors">Yes, Send Now</button>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, color = 'text-white' }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

export default function EmailCampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [analytics, setAnalytics] = useState<Record<string, EmailCampaignAnalytics>>({});
  const [events, setEvents] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [sendTarget, setSendTarget] = useState<EmailCampaign | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

  const notify = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      const [campaignList, evRes] = await Promise.all([
        apiClient.listEmailCampaigns(token) as Promise<EmailCampaign[]>,
        fetch(`${apiBase}/events?organizerId=me`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const evData = evRes.ok ? await evRes.json() : [];
      const evList: any[] = Array.isArray(evData) ? evData : evData.items ?? evData.events ?? [];

      setCampaigns(campaignList);
      setEvents(evList.map((e: any) => ({ id: e.id, title: e.title ?? e.name ?? e.id })));

      // Fetch analytics for sent campaigns in parallel
      const analyticsMap: Record<string, EmailCampaignAnalytics> = {};
      await Promise.all(
        campaignList
          .filter(c => c.status === 'sent')
          .map(async c => {
            try {
              analyticsMap[c.id] = await apiClient.getEmailCampaignAnalytics(c.id, token) as EmailCampaignAnalytics;
            } catch { /* not yet available */ }
          }),
      );
      setAnalytics(analyticsMap);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load campaigns.');
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    const token = localStorage.getItem('lumentix_access_token');
    const role = localStorage.getItem('lumentix_user_role');
    if (!token) { router.replace('/login'); return; }
    if (role && role !== 'organizer') { router.replace('/'); return; }
    loadData(token);
  }, [loadData, router]);

  const handleCreated = (campaign: EmailCampaign) => {
    setCampaigns(prev => [campaign, ...prev]);
    setShowComposer(false);
    notify('Campaign saved as draft.');
  };

  const handleSendConfirm = async () => {
    if (!sendTarget) return;
    const token = localStorage.getItem('lumentix_access_token') ?? '';
    try {
      const updated = await apiClient.sendMarketingEmails(sendTarget.id, token) as EmailCampaign;
      setCampaigns(prev => prev.map(c => c.id === updated.id ? updated : c));
      notify(`"${updated.subject}" sent to ${updated.recipientCount.toLocaleString()} recipients!`);
    } catch (err: any) {
      notify(err.message ?? 'Failed to send campaign.', 'err');
    } finally {
      setSendTarget(null);
    }
  };

  const handleCancel = async (campaign: EmailCampaign) => {
    const token = localStorage.getItem('lumentix_access_token') ?? '';
    try {
      const updated = await apiClient.cancelEmailCampaign(campaign.id, token) as EmailCampaign;
      setCampaigns(prev => prev.map(c => c.id === updated.id ? updated : c));
      notify('Campaign cancelled.');
    } catch (err: any) {
      notify(err.message ?? 'Failed to cancel.', 'err');
    }
  };

  // Aggregate metrics
  const sent = campaigns.filter(c => c.status === 'sent');
  const totalSent = sent.reduce((a, c) => a + (analytics[c.id]?.totalSent ?? c.recipientCount), 0);
  const totalOpened = sent.reduce((a, c) => a + (analytics[c.id]?.totalOpened ?? 0), 0);
  const totalClicked = sent.reduce((a, c) => a + (analytics[c.id]?.totalClicked ?? 0), 0);
  const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;
  const clickRate = totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0;

  const filtered = statusFilter === 'all' ? campaigns : campaigns.filter(c => c.status === statusFilter);

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <Link href="/organizer/dashboard" className="text-xs text-gray-500 hover:text-indigo-400 transition-colors block mb-1">← Dashboard</Link>
          <h1 className="text-xl font-bold text-white">Email Campaigns</h1>
          <p className="text-sm text-gray-400 mt-0.5">Design and send newsletters to past attendees</p>
        </div>
        <button
          type="button"
          onClick={() => setShowComposer(true)}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 text-sm font-medium transition-colors"
        >
          + New Campaign
        </button>
      </header>

      {/* Toast */}
      {toast && (
        <div className={`mx-6 mt-4 rounded-lg border px-4 py-3 text-sm flex justify-between items-center ${
          toast.type === 'err'
            ? 'bg-red-900/40 border-red-700 text-red-300'
            : 'bg-indigo-900/40 border-indigo-700 text-indigo-200'
        }`}>
          <span>{toast.msg}</span>
          <button type="button" onClick={() => setToast(null)} className="ml-4 hover:text-white" aria-label="Dismiss">×</button>
        </div>
      )}

      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Composer */}
        {showComposer && (
          <EmailCampaignComposer
            events={events}
            onCreated={handleCreated}
            onCancel={() => setShowComposer(false)}
          />
        )}

        {/* Aggregate metrics */}
        {!loading && campaigns.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard label="Total Campaigns" value={campaigns.length.toString()} />
            <MetricCard label="Emails Sent" value={totalSent.toLocaleString()} />
            <MetricCard label="Open Rate" value={`${openRate}%`} color={openRate > 20 ? 'text-green-400' : 'text-white'} />
            <MetricCard label="Click Rate" value={`${clickRate}%`} color={clickRate > 5 ? 'text-indigo-400' : 'text-white'} />
          </div>
        )}

        {/* Status filter */}
        {!loading && campaigns.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500">Filter:</span>
            {['all', 'draft', 'scheduled', 'sending', 'sent', 'cancelled'].map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors capitalize ${
                  statusFilter === s
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'border-gray-600 text-gray-400 hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Send modal */}
        <SendConfirmModal
          open={sendTarget !== null}
          campaign={sendTarget}
          onClose={() => setSendTarget(null)}
          onConfirm={handleSendConfirm}
        />

        {/* States */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="rounded-xl bg-gray-800 animate-pulse h-24" />)}
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg bg-red-900/30 border border-red-700 p-4 text-sm text-red-300">{error}</div>
        )}

        {!loading && !error && campaigns.length === 0 && !showComposer && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4" aria-hidden="true">✉️</div>
            <p className="text-gray-400 mb-2 font-medium">No campaigns yet</p>
            <p className="text-sm text-gray-500 mb-6">Create your first newsletter to reach past attendees.</p>
            <button
              type="button"
              onClick={() => setShowComposer(true)}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 text-sm font-medium transition-colors"
            >
              Create your first campaign
            </button>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="space-y-4">
            {filtered.map(campaign => (
              <EmailCampaignCard
                key={campaign.id}
                campaign={campaign}
                analytics={analytics[campaign.id] ?? null}
                onSend={c => setSendTarget(c)}
                onCancel={handleCancel}
              />
            ))}
          </div>
        )}

        {!loading && !error && campaigns.length > 0 && filtered.length === 0 && (
          <p className="text-center text-sm text-gray-500 py-8">No campaigns match the selected filter.</p>
        )}
      </div>
    </main>
  );
}
