'use client';

import type { EmailCampaign, EmailCampaignAnalytics } from '@/types/email-campaign';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-700/50 text-gray-300 border-gray-600',
  scheduled: 'bg-yellow-900/40 text-yellow-300 border-yellow-700',
  sending: 'bg-blue-900/40 text-blue-300 border-blue-700',
  sent: 'bg-green-900/40 text-green-300 border-green-700',
  cancelled: 'bg-red-900/40 text-red-300 border-red-700',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full border capitalize ${
        STATUS_STYLES[status] ?? STATUS_STYLES.draft
      }`}
    >
      {status}
    </span>
  );
}

interface AnalyticsPillProps {
  label: string;
  value: number;
  total?: number;
  color?: string;
}

function AnalyticsPill({ label, value, total, color = 'text-white' }: AnalyticsPillProps) {
  const pct = total && total > 0 ? Math.round((value / total) * 100) : null;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-lg font-bold ${color}`}>{value.toLocaleString()}</span>
      <span className="text-xs text-gray-500">{label}</span>
      {pct !== null && <span className="text-xs text-gray-600">{pct}%</span>}
    </div>
  );
}

interface Props {
  campaign: EmailCampaign;
  analytics?: EmailCampaignAnalytics | null;
  onSend: (campaign: EmailCampaign) => void;
  onCancel: (campaign: EmailCampaign) => void;
  selected?: boolean;
  onClick?: () => void;
}

export function EmailCampaignCard({
  campaign,
  analytics,
  onSend,
  onCancel,
  selected,
  onClick,
}: Props) {
  const canSend = campaign.status === 'draft' || campaign.status === 'scheduled';
  const canCancel = campaign.status !== 'sent' && campaign.status !== 'cancelled';

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      className={`rounded-xl border p-5 transition-colors ${
        selected
          ? 'border-indigo-600 bg-indigo-900/20'
          : 'border-gray-700 bg-gray-800/60 hover:bg-gray-800'
      } ${onClick ? 'cursor-pointer' : ''}`}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{campaign.subject}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {campaign.recipientCount.toLocaleString()} recipient
            {campaign.recipientCount !== 1 ? 's' : ''} ·{' '}
            {new Date(campaign.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>
        <StatusBadge status={campaign.status} />
      </div>

      {/* Analytics row — shown only if campaign has been sent */}
      {campaign.status === 'sent' && analytics && (
        <div className="grid grid-cols-5 gap-2 mb-4 rounded-lg bg-gray-900/50 border border-gray-700 px-3 py-2">
          <AnalyticsPill
            label="Sent"
            value={analytics.totalSent}
          />
          <AnalyticsPill
            label="Delivered"
            value={analytics.totalDelivered}
            total={analytics.totalSent}
            color="text-green-400"
          />
          <AnalyticsPill
            label="Opened"
            value={analytics.totalOpened}
            total={analytics.totalSent}
            color="text-indigo-400"
          />
          <AnalyticsPill
            label="Clicked"
            value={analytics.totalClicked}
            total={analytics.totalSent}
            color="text-blue-400"
          />
          <AnalyticsPill
            label="Bounced"
            value={analytics.totalBounced}
            total={analytics.totalSent}
            color="text-red-400"
          />
        </div>
      )}

      {/* Scheduled time */}
      {campaign.scheduledAt && campaign.status === 'scheduled' && (
        <p className="text-xs text-yellow-400 mb-3">
          Scheduled:{' '}
          {new Date(campaign.scheduledAt).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      )}

      {/* Sent time */}
      {campaign.sentAt && campaign.status === 'sent' && (
        <p className="text-xs text-green-400 mb-3">
          Sent:{' '}
          {new Date(campaign.sentAt).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      )}

      {/* Actions */}
      {(canSend || canCancel) && (
        <div className="flex gap-2">
          {canSend && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSend(campaign);
              }}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-3 py-1.5 transition-colors"
            >
              Send Now
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCancel(campaign);
              }}
              className="rounded-lg border border-gray-600 text-gray-400 hover:text-white hover:bg-gray-700 text-xs font-medium px-3 py-1.5 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}
