import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment, PaymentStatus } from '../../entities/payment.entity';
import { TicketEntity } from '../../../tickets/entities/ticket.entity';
import { Event, EventStatus } from '../../../events/entities/event.entity';
import { User } from '../../../users/entities/user.entity';
import { StellarService } from '../../../stellar/stellar.service';
import { AuditService } from '../../../audit/audit.service';
import { EscrowService } from '../escrow.service';
import { RefundResultDto } from './dto/refund-result.dto';

@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,

    @InjectRepository(TicketEntity)
    private readonly ticketsRepository: Repository<TicketEntity>,

    @InjectRepository(Event)
    private readonly eventsRepository: Repository<Event>,

    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,

    private readonly stellarService: StellarService,
    private readonly auditService: AuditService,
    private readonly escrowService: EscrowService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — refundEvent(eventId)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Refund all confirmed payments for a cancelled event.
   * Returns a summary of each refund attempt.
   */
  async refundEvent(eventId: string): Promise<RefundResultDto[]> {
    // 1. Verify event exists and is cancelled
    const event = await this.eventsRepository.findOne({
      where: { id: eventId },
      select: [
        'id',
        'title',
        'status',
        'escrowPublicKey',
        'escrowSecretEncrypted',
      ],
    });

    if (!event) {
      throw new NotFoundException(`Event "${eventId}" not found.`);
    }

    if (event.status !== EventStatus.CANCELLED) {
      throw new BadRequestException(
        `Refunds can only be issued for cancelled events. ` +
          `Current status: "${event.status}".`,
      );
    }

    if (!event.escrowPublicKey || !event.escrowSecretEncrypted) {
      throw new BadRequestException(
        `Event "${eventId}" has no escrow account configured. Cannot process refunds.`,
      );
    }

    // 2. Fetch all confirmed payments for this event
    const confirmedPayments = await this.paymentsRepository.find({
      where: { eventId, status: PaymentStatus.CONFIRMED },
    });

    if (confirmedPayments.length === 0) {
      this.logger.log(`No confirmed payments to refund for event=${eventId}`);
      return [];
    }

    this.logger.log(
      `Processing ${confirmedPayments.length} refund(s) for event=${eventId}`,
    );

    // 3. Decrypt escrow secret once — shared across all refunds for this event
    const escrowSecret = await this.escrowService.decryptEscrowSecret(
      event.escrowSecretEncrypted,
    );

    // 4. Process each payment individually — failures are isolated
    const results: RefundResultDto[] = [];

    for (const payment of confirmedPayments) {
      const result = await this.processSingleRefund(
        payment,
        event,
        escrowSecret,
      );
      results.push(result);
    }

    await this.auditService.log({
      action: 'REFUND_EVENT_COMPLETED',
      userId: 'system',
      resourceId: eventId,
      meta: {
        total: results.length,
        succeeded: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      },
    });

    return results;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — process a single payment refund
  // ─────────────────────────────────────────────────────────────────────────

  private async processSingleRefund(
    payment: Payment,
    event: Event,
    escrowSecret: string,
  ): Promise<RefundResultDto> {
    const base: Pick<
      RefundResultDto,
      'paymentId' | 'userId' | 'amount' | 'currency'
    > = {
      paymentId: payment.id,
      userId: payment.userId,
      amount: Number(payment.amount),
      currency: payment.currency,
    };

    try {
      // 1. Reject partial-amount guard — amount must be an exact positive value
      const amount = Number(payment.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new BadRequestException(
          `Invalid payment amount "${payment.amount}" — partial or zero refunds are rejected.`,
        );
      }

      // 2. Resolve the user's Stellar public key
      const user = await this.usersRepository.findOne({
        where: { id: payment.userId },
        select: ['id', 'stellarPublicKey'],
      });

      if (!user) {
        throw new NotFoundException(`User "${payment.userId}" not found.`);
      }

      if (!user.stellarPublicKey) {
        throw new BadRequestException(
          `User "${payment.userId}" has no Stellar public key on file. Cannot send refund.`,
        );
      }

      // 3. Send exact amount back to the original payer via StellarService
      const txResponse = await this.stellarService.sendPayment(
        escrowSecret,
        user.stellarPublicKey,
        String(amount),
        payment.currency,
      );

      const txHash =
        typeof txResponse.hash === 'string' ? txResponse.hash : 'unknown';

      // 4. Mark payment as refunded
      payment.status = PaymentStatus.REFUNDED;
      await this.paymentsRepository.save(payment);

      // 5. Mark associated ticket as refunded
      await this.ticketsRepository.update(
        { eventId: event.id, ownerId: payment.userId },
        { status: 'refunded' },
      );

      // 6. Audit log
      await this.auditService.log({
        action: 'REFUND_ISSUED',
        userId: payment.userId,
        resourceId: payment.id,
        meta: {
          eventId: event.id,
          amount,
          currency: payment.currency,
          transactionHash: txHash,
          destinationPublicKey: user.stellarPublicKey,
        },
      });

      this.logger.log(
        `Refund issued: paymentId=${payment.id} user=${payment.userId} ` +
          `amount=${amount} ${payment.currency} txHash=${txHash}`,
      );

      return { ...base, success: true, transactionHash: txHash };
    } catch (error: unknown) {
      const reason =
        error instanceof Error ? error.message : 'Unknown error during refund';

      // Audit the failure but do NOT rethrow — we continue processing others
      await this.auditService.log({
        action: 'REFUND_FAILED',
        userId: payment.userId,
        resourceId: payment.id,
        meta: { eventId: event.id, reason },
      });

      this.logger.error(
        `Refund failed: paymentId=${payment.id} user=${payment.userId} reason=${reason}`,
      );

      return { ...base, success: false, error: reason };
    }
  }
}
