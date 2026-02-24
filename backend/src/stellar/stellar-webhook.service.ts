import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Horizon } from '@stellar/stellar-sdk';
import { StellarService } from '../stellar.service';
import { PaymentsService } from '../../payments/payments.service';
import { SponsorsService } from '../../sponsors/sponsors.service';

const RECONNECT_DELAY_MS = 5_000;
const MAX_RECONNECT_DELAY_MS = 60_000;
const BACKOFF_MULTIPLIER = 2;

@Injectable()
export class StellarWebhookService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StellarWebhookService.name);

  private streamCloser: (() => void) | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = RECONNECT_DELAY_MS;
  private destroyed = false;

  constructor(
    private readonly stellarService: StellarService,
    private readonly paymentsService: PaymentsService,
    private readonly sponsorsService: SponsorsService,
  ) {}

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  onModuleInit(): void {
    this.logger.log('Starting Stellar payment stream listener');
    this.connect();
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    this.clearReconnectTimer();
    this.closeStream();
    this.logger.log('Stellar payment stream shut down');
  }

  // ─── Connection management ────────────────────────────────────────────────

  private connect(): void {
    if (this.destroyed) return;

    this.logger.log('Opening Stellar payment stream...');

    try {
      this.streamCloser = this.stellarService.streamPayments(
        (payment) => void this.handlePayment(payment),
      );

      // Reset backoff on successful connection
      this.reconnectDelay = RECONNECT_DELAY_MS;
      this.logger.log('Stellar payment stream connected');
    } catch (err) {
      this.logger.error('Failed to open stream, scheduling reconnect', err);
      this.scheduleReconnect();
    }
  }

  private closeStream(): void {
    if (this.streamCloser) {
      this.streamCloser();
      this.streamCloser = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;

    this.clearReconnectTimer();

    this.logger.warn(
      `Reconnecting Stellar stream in ${this.reconnectDelay}ms...`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.closeStream();
      this.connect();

      // Exponential backoff capped at max delay
      this.reconnectDelay = Math.min(
        this.reconnectDelay * BACKOFF_MULTIPLIER,
        MAX_RECONNECT_DELAY_MS,
      );
    }, this.reconnectDelay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ─── Payment handler ──────────────────────────────────────────────────────

  async handlePayment(
    payment: Horizon.ServerApi.PaymentOperationRecord,
  ): Promise<void> {
    this.logger.debug(
      `Received payment: type=${payment.type} id=${payment.id}`,
    );

    // We only handle payment and create_account operations
    if (payment.type !== 'payment' && payment.type !== 'create_account') {
      this.logger.debug(`Skipping non-payment operation type: ${payment.type}`);
      return;
    }

    const transactionHash = payment.transaction_hash;

    if (!transactionHash) {
      this.logger.warn('Payment record has no transaction_hash, skipping');
      return;
    }

    // Try payment confirmation first, then sponsor confirmation
    const confirmed =
      (await this.tryConfirmPayment(transactionHash)) ||
      (await this.tryConfirmSponsor(transactionHash));

    if (!confirmed) {
      this.logger.debug(
        `No pending payment or sponsor found for tx: ${transactionHash}`,
      );
    }
  }

  // ─── Payment confirmation ─────────────────────────────────────────────────

  private async tryConfirmPayment(transactionHash: string): Promise<boolean> {
    try {
      await this.paymentsService.confirmPayment(transactionHash);
      this.logger.log(
        `Payment confirmed via stream: txHash=${transactionHash}`,
      );
      return true;
    } catch (err: unknown) {
      // NotFoundException means no pending payment matched — not an error
      if (isNotFound(err)) return false;

      // BadRequestException with "not found on Stellar" means tx isn't ready — skip
      if (isBadRequest(err) && isNotFoundMessage(err)) return false;

      // Anything else is unexpected — log but don't crash the stream
      this.logger.error(
        `Unexpected error confirming payment for tx ${transactionHash}`,
        err,
      );
      return false;
    }
  }

  // ─── Sponsor confirmation ─────────────────────────────────────────────────

  private async tryConfirmSponsor(transactionHash: string): Promise<boolean> {
    try {
      await this.sponsorsService.confirmSponsorPayment(transactionHash);
      this.logger.log(
        `Sponsor payment confirmed via stream: txHash=${transactionHash}`,
      );
      return true;
    } catch (err: unknown) {
      if (isNotFound(err)) return false;
      if (isBadRequest(err) && isNotFoundMessage(err)) return false;

      this.logger.error(
        `Unexpected error confirming sponsor for tx ${transactionHash}`,
        err,
      );
      return false;
    }
  }
}

// ─── Error type helpers ───────────────────────────────────────────────────────

function isNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    (err as { status: number }).status === 404
  );
}

function isBadRequest(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    (err as { status: number }).status === 400
  );
}

function isNotFoundMessage(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string' &&
    (err as { message: string }).message.toLowerCase().includes('not found')
  );
}
