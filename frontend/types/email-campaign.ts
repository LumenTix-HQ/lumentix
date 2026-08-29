export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'sending'
  | 'sent'
  | 'cancelled';

export interface EmailCampaign {
  id: string;
  organizerId: string;
  eventId: string | null;
  subject: string;
  bodyHtml: string;
  status: CampaignStatus;
  recipientCount: number;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailCampaignAnalytics {
  id: string;
  campaignId: string;
  totalSent: number;
  totalDelivered: number;
  totalOpened: number;
  totalClicked: number;
  totalBounced: number;
  totalUnsubscribed: number;
  lastUpdatedAt: string;
}

export interface CreateEmailCampaignPayload {
  subject: string;
  bodyHtml: string;
  eventId?: string;
  scheduledAt?: string;
}

export interface UpdateEmailCampaignPayload {
  subject?: string;
  bodyHtml?: string;
  scheduledAt?: string;
}

export interface TrackAnalyticsPayload {
  totalDelivered?: number;
  totalOpened?: number;
  totalClicked?: number;
  totalBounced?: number;
  totalUnsubscribed?: number;
}
