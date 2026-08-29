import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Logger } from '@nestjs/common';
import { RefundService } from '../../payments/refunds/refund.service';
import { EscrowService } from '../../payments/services/escrow.service';
import { SorobanService } from '../../stellar';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/entities/audit-log.entity';
import { Event } from '../entities/event.entity';

@Processor('events')
export class CancelEventProcessor {
  private readonly logger = new Logger(CancelEventProcessor.name);

  constructor(
    private readonly refundService: RefundService,
    private readonly escrowService: EscrowService,
    private readonly sorobanService: SorobanService,
    private readonly auditService: AuditService,
    @InjectRepository(Event)
    private readonly eventsRepository: Repository<Event>,
  ) {}

  @Process('cancel-event')
  async handleCancelEvent(job: Job<{ eventId: string }>) {
    const { eventId } = job.data;
    this.logger.log(`Starting refund process for event ${eventId}`);
    try {
      await this.refundService.refundAllForEvent(eventId);
      this.logger.log(`Successfully processed refunds for event ${eventId}`);
    } catch (error) {
      this.logger.error(`Failed to process refunds for event ${eventId}`, error.stack);
      throw error;
    }

    await this.processOnChainCancellation(eventId);
  }

  /**
   * Best-effort on-chain cancellation + mass refund for events that have a
   * LumentixContract counterpart. Events without a contractEventId only ever
   * go through the classic-Stellar escrow refund above.
   */
  private async processOnChainCancellation(eventId: string): Promise<void> {
    const event = await this.eventsRepository.findOne({
      where: { id: eventId },
      select: ['id', 'contractEventId', 'escrowSecretEncrypted'],
    });

    if (!event?.contractEventId || !event.escrowSecretEncrypted) {
      return;
    }

    try {
      const organizerSecret = await this.escrowService.decryptEscrowSecret(
        event.escrowSecretEncrypted,
      );

      await this.sorobanService.cancelEventOnChain(organizerSecret, event.contractEventId);
      const refundedCount = await this.sorobanService.executeMassRefund(
        organizerSecret,
        event.contractEventId,
      );
      const verified = await this.sorobanService.verifyRefundCompletion(event.contractEventId);

      await this.eventsRepository.update(eventId, {
        onChainRefundVerifiedAt: verified ? new Date() : null,
      });

      await this.auditService.log({
        action: AuditAction.EVENT_CANCELLED_ON_CHAIN,
        userId: 'system',
        resourceId: eventId,
        meta: { contractEventId: event.contractEventId },
      });
      await this.auditService.log({
        action: AuditAction.MASS_REFUND_EXECUTED_ON_CHAIN,
        userId: 'system',
        resourceId: eventId,
        meta: { contractEventId: event.contractEventId, refundedCount, verified },
      });

      this.logger.log(
        `On-chain cancellation complete for event ${eventId}: refunded=${refundedCount} verified=${verified}`,
      );
    } catch (error) {
      this.logger.error(
        `On-chain cancellation/refund failed for event ${eventId}`,
        error.stack,
      );
    }
  }
}
