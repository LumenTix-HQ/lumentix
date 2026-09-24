export const NOTIFICATION_CHANNELS = ['push', 'email', 'sms', 'in_app'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_CATEGORIES = [
  'eventReminders',
  'scheduleChanges',
  'paymentConfirmations',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export type ChannelPreferences = Record<NotificationChannel, Record<NotificationCategory, boolean>>;

export interface QuietHours {
  enabled: boolean;
  start: string;
  end: string;
  timezone: string;
}

export interface NotificationPreferences {
  channels: ChannelPreferences;
  quietHours: QuietHours;
}

export type SaveNotificationPreferences = {
  channels?: ChannelPreferences;
  quietHours?: QuietHours;
};