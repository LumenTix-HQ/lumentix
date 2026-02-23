import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { EventStatus } from '../events/entities/event.entity';
import { EventsService } from '../events/events.service';
import { StellarService } from '../stellar/stellar.service';
import { Payment, PaymentStatus } from './entities/payment.entity';

/** Supported on-chain asset codes */
const SUPPORTED_ASSETS = ['XLM', 'USDC'] as const;
type SupportedAsset = (typeof SUPPORTED_ASSETS)[number];

export interface PaymentIntent {
  paymentId: string;
  escrowWallet: string;
  amount: number;
  currency: string;
  memo: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly escrowWallet: string;

  constructor(
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
    private readonly eventsService: EventsService,
    private readonly stellarService: StellarService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {
    this.escrowWallet =
      this.configService.get<string>('ESCROW_WALLET_PUBLIC_KEY') ?? '';

    if (!this.escrowWallet) {
      this.logger.warn(
        'ESCROW_WALLET_PUBLIC_KEY is not set. Payment confirmation will fail.',
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1 — Create payment intent
  // ─────────────────────────────────────────────────────────────────────────

  async createPaymentIntent(
    eventId: string,
    userId: string,
  ): Promise<PaymentIntent> {
    // 1. Validate event exists
    const event = await this.eventsService.getEventById(eventId);

    // 2. Validate event status
    if (event.status === EventStatus.CANCELLED) {
      throw new BadRequestException(
        `Event "${event.title}" has been suspended and is no longer available for purchase.`,
      );
    }

    if (event.status !== EventStatus.PUBLISHED) {
      throw new BadRequestException(
        `Event "${event.title}" is not available for purchase (status: ${event.status}).`,
      );
    }

    // 3. Validate asset type
    const currency = event.currency.toUpperCase() as SupportedAsset;
    if (!SUPPORTED_ASSETS.includes(currency)) {
      throw new BadRequestException(
        `Unsupported asset "${event.currency}". Supported assets: ${SUPPORTED_ASSETS.join(', ')}.`,
      );
    }

    // 4. ── Capacity check ────────────────────────────────────────────────────
    //    Count PENDING + CONFIRMED payments to prevent overselling.
    //    NOTE: For events with very high concurrency (flash sales etc.) consider
    //    wrapping this block and the payment INSERT in a serializable transaction
    //    with a pessimistic write-lock on the event row:
    //      await this.paymentsRepository.manager.transaction(
    //        'SERIALIZABLE', async (em) => { ... }
    //      );
    if (event.maxAttendees !== null) {
      const soldCount = await this.paymentsRepository.count({
        where: {
          eventId,
          status: In([PaymentStatus.PENDING, PaymentStatus.CONFIRMED]),
        },
      });

      if (soldCount >= event.maxAttendees) {
        throw new BadRequestException(
          `This event has reached its maximum capacity of ${event.maxAttendees} attendees.`,
        );
      }
    }

    // 5. Check for existing payment for this user and event
    const existing = await this.paymentsRepository.findOne({
      where: {
        userId,
        eventId,
        status: In([PaymentStatus.PENDING, PaymentStatus.CONFIRMED]),
      },
    });

    if (existing) {
      throw new ConflictException(
        `You already have an active or confirmed payment for this event.`,
      );
    }

    // 6. Persist a pending payment record
    const payment = this.paymentsRepository.create({
      eventId,
      userId,
      amount: event.ticketPrice,
      currency,
      status: PaymentStatus.PENDING,
    });
    const saved = await this.paymentsRepository.save(payment);

    await this.auditService.log({
      action: 'PAYMENT_INTENT_CREATED',
      userId,
      resourceId: saved.id,
      meta: { eventId, amount: saved.amount, currency: saved.currency },
    });

    this.logger.log(
      `Payment intent created: paymentId=${saved.id} event=${eventId} user=${userId}`,
    );

    return {
      paymentId: saved.id,
      escrowWallet: this.escrowWallet,
      amount: event.ticketPrice,
      currency,
      memo: saved.id,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2 — Confirm payment
  // ─────────────────────────────────────────────────────────────────────────

  async confirmPayment(
    transactionHash: string,
    callerId: string,
  ): Promise<Payment> {
    // ← add callerId
    let txRecord: Awaited<ReturnType<StellarService['getTransaction']>>;
    try {
      txRecord = await this.stellarService.getTransaction(transactionHash);
    } catch {
      throw new BadRequestException(
        `Transaction "${transactionHash}" not found on the Stellar network.`,
      );
    }

    const memoValue: string | undefined =
      typeof txRecord.memo === 'string' ? txRecord.memo : undefined;

    if (!memoValue) {
      throw new BadRequestException(
        'Transaction is missing a memo. Cannot correlate with a payment intent.',
      );
    }

    const payment = await this.paymentsRepository.findOne({
      where: { id: memoValue, status: PaymentStatus.PENDING },
    });

    if (!payment) {
      throw new NotFoundException(
        `No pending payment found for memo "${memoValue}".`,
      );
    }

    // ── Ownership check ──────────────────────────────────────────────────────
    if (payment.userId !== callerId) {
      throw new ForbiddenException(
        'You are not authorised to confirm this payment.',
      );
    }

    const ops = await this.resolvePaymentOperations(txRecord);

    if (ops.length === 0) {
      await this.markFailed(
        payment,
        'No payment operations found in transaction.',
      );
      throw new BadRequestException(
        'Transaction contains no payment operations.',
      );
    }

    const matchingOp = ops.find((op) => op.to === this.escrowWallet);

    if (!matchingOp) {
      await this.markFailed(
        payment,
        `Incorrect destination. Expected ${this.escrowWallet}.`,
      );
      throw new BadRequestException(
        `Payment destination does not match the escrow wallet.`,
      );
    }

    const assetCode: string =
      matchingOp.asset_type === 'native'
        ? 'XLM'
        : (matchingOp.asset_code ?? '');

    if (assetCode.toUpperCase() !== payment.currency.toUpperCase()) {
      await this.markFailed(
        payment,
        `Wrong asset. Expected ${payment.currency}, got ${assetCode}.`,
      );
      throw new BadRequestException(
        `Incorrect asset type. Expected ${payment.currency}, received ${assetCode}.`,
      );
    }

    if (!SUPPORTED_ASSETS.includes(assetCode.toUpperCase() as SupportedAsset)) {
      await this.markFailed(payment, `Unsupported asset "${assetCode}".`);
      throw new BadRequestException(`Asset "${assetCode}" is not supported.`);
    }

    const onChainAmount = parseFloat(matchingOp.amount);
    const expectedAmount = parseFloat(String(payment.amount));

    if (Math.abs(onChainAmount - expectedAmount) > 0.0000001) {
      await this.markFailed(
        payment,
        `Incorrect amount. Expected ${expectedAmount}, got ${onChainAmount}.`,
      );
      throw new BadRequestException(
        `Incorrect payment amount. Expected ${expectedAmount} ${payment.currency}, received ${onChainAmount}.`,
      );
    }

    payment.transactionHash = transactionHash;
    payment.status = PaymentStatus.CONFIRMED;
    const confirmed = await this.paymentsRepository.save(payment);

    await this.auditService.log({
      action: 'PAYMENT_CONFIRMED',
      userId: payment.userId,
      resourceId: payment.id,
      meta: {
        transactionHash,
        amount: payment.amount,
        currency: payment.currency,
      },
    });

    this.logger.log(
      `Payment confirmed: paymentId=${payment.id} txHash=${transactionHash}`,
    );

    return confirmed;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Tickets dependency helper
  // ─────────────────────────────────────────────────────────────────────────

  async getPaymentById(paymentId: string): Promise<Payment> {
    const payment = await this.paymentsRepository.findOne({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException(`Payment "${paymentId}" not found.`);
    }

    return payment;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private async resolvePaymentOperations(
    txRecord: Awaited<ReturnType<StellarService['getTransaction']>>,
  ): Promise<PaymentOp[]> {
    try {
      const opsHref: string | undefined = txRecord._links.operations?.href;
      if (!opsHref) return [];

      const res = await fetch(opsHref);
      if (!res.ok) return [];

      const json = (await res.json()) as {
        _embedded: { records: PaymentOp[] };
      };
      return json._embedded.records.filter(
        (op) => op.type === 'payment' || op.type === 'create_account',
      );
    } catch {
      return [];
    }
  }

  private async markFailed(payment: Payment, reason: string): Promise<void> {
    payment.status = PaymentStatus.FAILED;
    await this.paymentsRepository.save(payment);

    await this.auditService.log({
      action: 'PAYMENT_FAILED',
      userId: payment.userId,
      resourceId: payment.id,
      meta: { reason },
    });

    this.logger.warn(
      `Payment failed: paymentId=${payment.id} reason=${reason}`,
    );
  }
}

// ─── Internal type helpers ────────────────────────────────────────────────────

interface PaymentOp {
  type: string;
  to: string;
  amount: string;
  asset_type: string;
  asset_code?: string;
}
