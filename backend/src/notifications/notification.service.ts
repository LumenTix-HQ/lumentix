import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class NotificationService {
  constructor(
    @InjectQueue('notifications') private readonly notificationQueue: Queue,
  ) {}

  async queueTicketEmail(data: {
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
    email: string;
    amount: number;
    refundId: string;
  }) {
    await this.notificationQueue.add('sendRefundEmail', data, { attempts: 3 });
  }

  async queueSponsorEmail(data: { email: string; sponsorName: string }) {
    await this.notificationQueue.add('sendSponsorEmail', data, { attempts: 3 });
  }
}
