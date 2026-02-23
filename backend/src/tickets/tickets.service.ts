import * as crypto from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TicketEntity } from './entities/ticket.entity';
import { PaymentsService } from '../payments/payments.service';
import { PaymentStatus } from '../payments/entities/payment.entity';
import { StellarService } from '../stellar/stellar.service';

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(TicketEntity)
    private readonly ticketRepo: Repository<TicketEntity>,
    private readonly paymentsService: PaymentsService,
    private readonly stellarService: StellarService,
    private readonly configService: ConfigService,
  ) {}

  async issueTicket(paymentId: string): Promise<TicketEntity> {
    const payment = await this.paymentsService.getPaymentById(paymentId);

    if (payment.status !== PaymentStatus.CONFIRMED) {
      throw new BadRequestException('Payment not confirmed');
    }

    if (!payment.transactionHash) {
      throw new BadRequestException('Payment has no transaction hash');
    }

    const existing = await this.ticketRepo.findOne({
      where: { transactionHash: payment.transactionHash },
    });
    if (existing) return existing;

    const tx = await this.stellarService.getTransaction(
      payment.transactionHash,
    );

    const memoValue: string | undefined =
      typeof tx.memo === 'string' ? tx.memo : undefined;

    if (!memoValue) {
      throw new BadRequestException(
        'Transaction is missing memo. Cannot verify payment reference.',
      );
    }

    if (memoValue !== payment.id) {
      throw new BadRequestException(
        `Transaction memo does not match paymentId. Expected "${payment.id}", got "${memoValue}".`,
      );
    }

    const ticket = this.ticketRepo.create({
      eventId: payment.eventId,
      ownerId: payment.userId,
      assetCode: payment.currency,
      transactionHash: payment.transactionHash,
      status: 'valid',
    });

    // Persist first to obtain the auto-generated UUID, then sign it
    const saved = await this.ticketRepo.save(ticket);
    saved.signature = this.signTicketId(saved.id);
    return this.ticketRepo.save(saved);
  }

  async transferTicket(
    ticketId: string,
    callerOwnerId: string,
    newOwnerId: string,
  ): Promise<TicketEntity> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    if (ticket.ownerId !== callerOwnerId) {
      throw new ForbiddenException('Not ticket owner');
    }

    if (ticket.status !== 'valid') {
      throw new BadRequestException('Ticket not transferable');
    }

    ticket.ownerId = newOwnerId;
    return this.ticketRepo.save(ticket);
  }

  async verifyTicket(
    ticketId: string,
    signature: string,
  ): Promise<TicketEntity> {
    // 1. Cryptographic signature check — must come before any DB lookup
    //    to avoid leaking ticket existence to unauthenticated callers.
    if (!this.verifySignature(ticketId, signature)) {
      throw new UnauthorizedException('Invalid ticket signature');
    }

    // 2. Ticket existence check
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    // 3. Status guard
    if (ticket.status === 'used') {
      throw new BadRequestException('Ticket has already been used');
    }
    if (ticket.status !== 'valid') {
      throw new BadRequestException('Ticket is no longer valid');
    }

    // 4. Mark as used — atomic save prevents double-scan in practice;
    //    a DB-level unique partial index on (id, status='used') is recommended
    //    for high-throughput gate scenarios.
    ticket.status = 'used';
    return this.ticketRepo.save(ticket);
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Signs `ticketId` with the server's PEM-formatted private key.
   * Algorithm: SHA-256 with RSA-PSS or EC depending on key type.
   * Returns a lowercase hex string.
   */
  private signTicketId(ticketId: string): string {
    const privateKey = this.configService.get<string>(
      'TICKET_SIGNING_PRIVATE_KEY',
    );
    if (!privateKey) {
      throw new InternalServerErrorException(
        'TICKET_SIGNING_PRIVATE_KEY is not configured.',
      );
    }

    const signer = crypto.createSign('SHA256');
    signer.update(ticketId);
    signer.end();
    return signer.sign(privateKey, 'hex');
  }

  /**
   * Verifies that `signature` (hex) was produced by signing `ticketId`
   * with the private key corresponding to TICKET_SIGNING_PUBLIC_KEY.
   */
  private verifySignature(ticketId: string, signature: string): boolean {
    const publicKey = this.configService.get<string>(
      'TICKET_SIGNING_PUBLIC_KEY',
    );
    if (!publicKey) {
      throw new InternalServerErrorException(
        'TICKET_SIGNING_PUBLIC_KEY is not configured.',
      );
    }

    try {
      const verifier = crypto.createVerify('SHA256');
      verifier.update(ticketId);
      verifier.end();
      return verifier.verify(publicKey, signature, 'hex');
    } catch {
      // Malformed signature string (wrong length, non-hex, etc.)
      return false;
    }
  }
}
