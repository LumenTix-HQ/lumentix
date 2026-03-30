import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class NotificationService {
  constructor(
    @InjectQueue('notifications') private readonly notificationQueue: Queue,
  ) {}

  async queueTicketEmail(data: {
    userId: string;
    email: string;
    ticketId: string;
    eventName: string;
  }) {
    await this.notificationQueue.add('sendTicketEmail', data, {
      attempts: 3, // Retry 3 times if it fails
      backoff: {
        type: 'exponential',
        delay: 5000, // Wait 5s, then 10s, then 20s...
      },
      removeOnComplete: true, // Clean up Redis after success
    });
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
}
