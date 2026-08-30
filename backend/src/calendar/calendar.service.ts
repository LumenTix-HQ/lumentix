import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Event } from '../events/entities/event.entity';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

export interface CalendarInviteData {
  to: string;
  eventTitle: string;
  eventDescription?: string;
  startDate: string; // ISO string
  endDate: string;   // ISO string
  location?: string;
  organizerName?: string;
  ticketId?: string;
  uid?: string;
}

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generate an iCalendar (.ics) file content string for a single event.
   * RFC 5545 compliant.
   */
  generateIcalFile(data: {
    eventTitle: string;
    eventDescription?: string;
    startDate: string;   // ISO 8601
    endDate: string;     // ISO 8601
    location?: string;
    organizerName?: string;
    attendeeEmail?: string;
    attendeeName?: string;
    uid?: string;
    url?: string;
  }): string {
    const now = this.formatIcalDate(new Date().toISOString());
    const dtStart = this.formatIcalDate(data.startDate);
    const dtEnd = this.formatIcalDate(data.endDate);
    const uid = data.uid ?? `${Date.now()}-${Math.random().toString(36).substr(2, 9)}@lumentix`;
    const description = (data.eventDescription ?? '')
      .replace(/\n/g, '\\n')
      .replace(/,/g, '\\,');

    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Lumentix//Event Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${data.eventTitle}`,
      `DESCRIPTION:${description || 'No description provided.'}`,
    ];

    if (data.location) {
      lines.push(`LOCATION:${data.location.replace(/,/g, '\\,').replace(/\n/g, '\\n')}`);
    }

    if (data.organizerName) {
      const organizerEmail = this.configService.get<string>('MAIL_FROM') ?? 'noreply@lumentix.com';
      lines.push(`ORGANIZER;CN=${data.organizerName}:mailto:${organizerEmail}`);
    }

    if (data.attendeeEmail) {
      const attendeeName = data.attendeeName ?? data.attendeeEmail;
      lines.push(`ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;CN=${attendeeName}:mailto:${data.attendeeEmail}`);
    }

    if (data.url) {
      lines.push(`URL:${data.url}`);
    }

    lines.push('BEGIN:VALARM');
    lines.push('TRIGGER:-PT1H');
    lines.push('ACTION:DISPLAY');
    lines.push(`DESCRIPTION:Reminder: ${data.eventTitle}`);
    lines.push('END:VALARM');
    lines.push('END:VEVENT');
    lines.push('END:VCALENDAR');

    return lines.join('\r\n');
  }

  /**
   * Build a Google Calendar URL with pre-filled event details.
   */
  createGoogleCalendarLink(data: {
    eventTitle: string;
    eventDescription?: string;
    startDate: string;
    endDate: string;
    location?: string;
  }): string {
    const formatForUrl = (iso: string): string => {
      const d = new Date(iso);
      return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    };

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: data.eventTitle,
      dates: `${formatForUrl(data.startDate)}/${formatForUrl(data.endDate)}`,
    });

    if (data.eventDescription) {
      params.set('details', data.eventDescription);
    }
    if (data.location) {
      params.set('location', data.location);
    }

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  /**
   * Build an Outlook/Office 365 calendar URL with pre-filled event details.
   */
  createOutlookCalendarLink(data: {
    eventTitle: string;
    eventDescription?: string;
    startDate: string;
    endDate: string;
    location?: string;
  }): string {
    const start = new Date(data.startDate).toISOString();
    const end = new Date(data.endDate).toISOString();

    const params = new URLSearchParams({
      rdv: '1',
      path: '/calendar/action/compose',
      mode: 'edit',
      subject: data.eventTitle,
      startdt: start,
      enddt: end,
    });

    if (data.eventDescription) {
      params.set('body', data.eventDescription);
    }
    if (data.location) {
      params.set('location', data.location);
    }

    return `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`;
  }

  /**
   * Build a Yahoo Calendar URL with pre-filled event details.
   */
  createYahooCalendarLink(data: {
    eventTitle: string;
    eventDescription?: string;
    startDate: string;
    endDate: string;
    location?: string;
  }): string {
    const toYahooDate = (iso: string): string => {
      const d = new Date(iso);
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    };

    const params = new URLSearchParams({
      v: '60',
      view: 'd',
      type: '20',
      title: data.eventTitle,
      st: toYahooDate(data.startDate),
      et: toYahooDate(data.endDate),
    });

    if (data.eventDescription) {
      params.set('desc', data.eventDescription);
    }
    if (data.location) {
      params.set('in_loc', data.location);
    }

    return `https://calendar.yahoo.com/?${params.toString()}`;
  }

  /**
   * Build all calendar links as an object for embedding in UI or email.
   */
  createAllCalendarLinks(data: {
    eventTitle: string;
    eventDescription?: string;
    startDate: string;
    endDate: string;
    location?: string;
  }): {
    google: string;
    outlook: string;
    yahoo: string;
    icsContent: string;
  } {
    return {
      google: this.createGoogleCalendarLink(data),
      outlook: this.createOutlookCalendarLink(data),
      yahoo: this.createYahooCalendarLink(data),
      icsContent: this.generateIcalFile({ ...data, uid: `all-${Date.now()}@lumentix` }),
    };
  }

  /**
   * Format an ISO date string to iCalendar date format (YYYYMMDDTHHMMSSZ).
   */
  private formatIcalDate(iso: string): string {
    const d = new Date(iso);
    return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }
}

