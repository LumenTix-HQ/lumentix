import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Event } from '../events/entities/event.entity';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { MailerService } from '../mailer/mailer.service';

export interface CalendarAttendeeContact {
  email: string;
  name?: string;
}

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
    private readonly mailerService: MailerService,
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
    /**
     * RFC 5545 SEQUENCE — must increase on every update to the same UID so
     * calendar clients apply the change instead of ignoring a stale/
     * duplicate copy. Defaults to 0 for a first-time invite.
     */
    sequence?: number;
    /** PUBLISH: first invite. REQUEST: update to an existing invite. CANCEL: remove it. */
    method?: 'PUBLISH' | 'REQUEST' | 'CANCEL';
    cancelled?: boolean;
  }): string {
    const now = this.formatIcalDate(new Date().toISOString());
    const dtStart = this.formatIcalDate(data.startDate);
    const dtEnd = this.formatIcalDate(data.endDate);
    const uid = data.uid ?? `${Date.now()}-${Math.random().toString(36).substr(2, 9)}@lumentix`;
    const description = (data.eventDescription ?? '')
      .replace(/\n/g, '\\n')
      .replace(/,/g, '\\,');
    const method = data.method ?? 'PUBLISH';
    const sequence = data.sequence ?? 0;

    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Lumentix//Event Calendar//EN',
      'CALSCALE:GREGORIAN',
      `METHOD:${method}`,
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `SEQUENCE:${sequence}`,
      `DTSTAMP:${now}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${data.eventTitle}`,
      `DESCRIPTION:${description || 'No description provided.'}`,
      `STATUS:${data.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
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

  /** Generate a calendar event for a purchased ticket. */
  generate_ical_event(data: Parameters<CalendarService['generateIcalFile']>[0]): string {
    return this.generateIcalFile(data);
  }

  /**
   * Analytics #992 — build the (REQUEST-method, incremented-SEQUENCE) ICS
   * for an event that just changed, and email it to every attendee so
   * calendar apps that already imported the original invite apply the
   * update automatically instead of showing stale details.
   */
  async syncCalendarUpdate(
    event: {
      id: string;
      title: string;
      description?: string | null;
      startDate: Date;
      endDate: Date;
      location?: string | null;
      updatedAt: Date;
    },
    attendees: CalendarAttendeeContact[],
  ): Promise<void> {
    if (attendees.length === 0) return;

    // updatedAt (epoch seconds) is monotonically increasing across edits,
    // which is all RFC 5545 requires of SEQUENCE — no separate counter to
    // persist.
    const sequence = Math.floor(event.updatedAt.getTime() / 1000);

    await Promise.all(
      attendees.map((attendee) =>
        this.sendCalendarEmail(event, attendee, {
          method: 'REQUEST',
          sequence,
          subject: `Updated: ${event.title}`,
          intro: `The details for ${event.title} have changed. Your calendar invite has been updated below.`,
        }),
      ),
    );
  }

  /** Synchronize a purchased ticket's calendar entry after an event change. */
  async sync_calendar_update(
    event: Parameters<CalendarService['syncCalendarUpdate']>[0],
    attendees: CalendarAttendeeContact[],
  ): Promise<void> {
    return this.syncCalendarUpdate(event, attendees);
  }

  /**
   * Analytics #992 — build a CANCEL-method ICS for a cancelled event and
   * email it to every attendee, so calendar apps remove it automatically.
   */
  async removeCancelledEvent(
    event: {
      id: string;
      title: string;
      description?: string | null;
      startDate: Date;
      endDate: Date;
      location?: string | null;
      updatedAt: Date;
    },
    attendees: CalendarAttendeeContact[],
  ): Promise<void> {
    if (attendees.length === 0) return;

    const sequence = Math.floor(event.updatedAt.getTime() / 1000);

    await Promise.all(
      attendees.map((attendee) =>
        this.sendCalendarEmail(event, attendee, {
          method: 'CANCEL',
          sequence,
          cancelled: true,
          subject: `Cancelled: ${event.title}`,
          intro: `${event.title} has been cancelled. It has been removed from your calendar below.`,
        }),
      ),
    );
  }

  /** Remove a cancelled purchased event from attendee calendars. */
  async remove_cancelled_event(
    event: Parameters<CalendarService['removeCancelledEvent']>[0],
    attendees: CalendarAttendeeContact[],
  ): Promise<void> {
    return this.removeCancelledEvent(event, attendees);
  }

  private async sendCalendarEmail(
    event: {
      id: string;
      title: string;
      description?: string | null;
      startDate: Date;
      endDate: Date;
      location?: string | null;
    },
    attendee: CalendarAttendeeContact,
    opts: {
      method: 'REQUEST' | 'CANCEL';
      sequence: number;
      cancelled?: boolean;
      subject: string;
      intro: string;
    },
  ): Promise<void> {
    const icsContent = this.generate_ical_event({
      eventTitle: event.title,
      eventDescription: event.description ?? undefined,
      startDate: event.startDate.toISOString(),
      endDate: event.endDate.toISOString(),
      location: event.location ?? undefined,
      uid: `event-${event.id}@lumentix`,
      attendeeEmail: attendee.email,
      attendeeName: attendee.name,
      method: opts.method,
      sequence: opts.sequence,
      cancelled: opts.cancelled,
    });

    try {
      await this.mailerService.send({
        to: attendee.email,
        subject: opts.subject,
        html: `<p>${opts.intro}</p>`,
        attachments: [
          {
            filename: `event-${event.id}.ics`,
            content: icsContent,
            contentType: `text/calendar; method=${opts.method}; charset=utf-8`,
          },
        ],
      });
    } catch (err) {
      this.logger.error(
        `Failed to send calendar ${opts.method} email to ${attendee.email} for event ${event.id}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
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
      icsContent: this.generate_ical_event({ ...data, uid: `all-${Date.now()}@lumentix` }),
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

