import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TicketEntity } from '../tickets/entities/ticket.entity';
import { Event, EventStatus } from '../events/entities/event.entity';

@Injectable()
export class NotificationService {
  constructor(
    @InjectQueue('notifications') private readonly notificationQueue: Queue,
    @InjectRepository(TicketEntity)
    private readonly ticketRepo: Repository<TicketEntity>,
  ) { }

  async queueTicketEmail(data: {
    userId: string;
    email: string;
    ticketId: string;
    eventName: string;
    pdfUrl?: string;
  }) {
    await this.notificationQueue.add('sendTicketEmail', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
    });
  }

  async queueTicketSoldEmail(data: {
    email: string;
    ticketId: string;
    amount: number;
    currency: string;
  }) {
    await this.notificationQueue.add('sendTicketSoldEmail', data, { attempts: 3 });
  }

  async queueRefundEmail(data: {
    userId: string;
    email: string;
    amount: number;
    refundId: string;
  }) {
    await this.notificationQueue.add('sendRefundEmail', data, { attempts: 3 });
  }

  async queueSponsorEmail(data: {
    userId: string;
    email: string;
    sponsorName: string;
  }) {
    await this.notificationQueue.add('sendSponsorEmail', data, { attempts: 3 });
  }

  async queueSponsorConfirmedEmail(data: {
    userId: string;
    email: string;
    sponsorName: string;
    eventTitle: string;
    amount: number;
    currency: string;
    transactionHash: string;
  }) {
    await this.notificationQueue.add('sendSponsorConfirmedEmail', data, { attempts: 3 });
  }

  async queuePaymentFailedEmail(data: {
    userId: string;
    email: string;
    eventTitle: string;
    amount: number;
    currency: string;
    reason: string;
  }) {
    await this.notificationQueue.add('sendPaymentFailedEmail', data, { attempts: 3 });
  }

  async queueEventCancelledEmail(data: {
    emails: string[];
    eventTitle: string;
    refundInfo: string;
  }) {
    await this.notificationQueue.add('sendEventCancelledEmail', data, { attempts: 3 });
  }

  async queueEventPublishedEmail(data: {
    email: string;
    eventTitle: string;
  }) {
    await this.notificationQueue.add('sendEventPublishedEmail', data, { attempts: 3 });
  }

  async queueEventCompletedEmail(data: {
    email: string;
    eventTitle: string;
  }) {
    await this.notificationQueue.add('sendEventCompletedEmail', data, { attempts: 3 });
  }

  async queueLifecycleEmail(event: Event): Promise<void> {
    switch (event.status) {
      case EventStatus.PUBLISHED:
        // Email to organizer: "Your event is live"
        await this.notificationQueue.add('sendEventPublishedEmail', {
          organizerId: event.organizerId,
          eventTitle: event.title,
          eventId: event.id,
        });
        break;

      case EventStatus.CANCELLED:
        // Fetch all ticket holders and email each one
        // This is a batch operation — queue one job per ticket holder
        const ticketHolderIds = await this.getTicketHolderIds(event.id);
        for (const userId of ticketHolderIds) {
          await this.notificationQueue.add('sendEventCancelledEmail', {
            userId,
            eventTitle: event.title,
            eventId: event.id,
          });
        }
        break;

      case EventStatus.COMPLETED:
        // Email to organizer: "Your event has completed"
        await this.notificationQueue.add('sendEventCompletedEmail', {
          organizerId: event.organizerId,
          eventTitle: event.title,
          eventId: event.id,
        });
        break;
    }
  }

  private async getTicketHolderIds(eventId: string): Promise<string[]> {
    const tickets = await this.ticketRepo.find({
      select: ['ownerId'],
      where: { eventId, status: 'valid' },
    });
    return [...new Set(tickets.map((t) => t.ownerId))];
  }
}
