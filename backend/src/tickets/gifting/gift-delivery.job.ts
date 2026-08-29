import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { GiftingService } from './gifting.service';

/**
 * Releases gifts whose scheduled delivery time has arrived.
 *
 * Runs every minute rather than on a timer per gift: a gift may be scheduled
 * weeks out, and an in-process timer does not survive a restart or a second
 * instance.
 */
@Injectable()
export class GiftDeliveryJob {
  private readonly logger = new Logger(GiftDeliveryJob.name);

  constructor(private readonly giftingService: GiftingService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async deliverDueGifts(): Promise<void> {
    const { delivered, failed } = await this.giftingService.deliverDueGifts();
    if (delivered > 0 || failed > 0) {
      this.logger.log(`Gift delivery sweep: ${delivered} delivered, ${failed} failed`);
    }
  }
}
