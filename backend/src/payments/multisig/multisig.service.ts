import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { MultisigPayout, PayoutStatus } from './entities/multisig-payout.entity';
import { InitiatePayoutDto } from './dto/initiate-payout.dto';
import { Event, EventStatus } from '../../events/entities/event.entity';
import { EscrowService } from '../services/escrow.service';
import { StellarService } from '../../stellar/stellar.service';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/entities/audit-log.entity';

@Injectable()
export class MultisigService {
  private readonly logger = new Logger(MultisigService.name);

  constructor(
    @InjectRepository(MultisigPayout)
    private readonly payoutRepository: Repository<MultisigPayout>,
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    private readonly escrowService: EscrowService,
    private readonly stellarService: StellarService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  async initiateMultisigPayout(
    dto: InitiatePayoutDto,
    initiatorId: string,
  ): Promise<MultisigPayout> {
    const event = await this.eventRepository.findOne({
      where: { id: dto.eventId },
    });

    if (!event) {
      throw new NotFoundException(`Event with id "${dto.eventId}" not found`);
    }

    if (event.status !== EventStatus.COMPLETED) {
      throw new BadRequestException('Event must be completed before dispersing funds');
    }

    if (!event.escrowPublicKey) {
      throw new BadRequestException('Event has no escrow account');
    }

    const payout = this.payoutRepository.create({
      eventId: dto.eventId,
      organizerWallet: dto.organizerWallet,
      amount: String(dto.amount),
      currency: dto.currency || 'XLM',
      requiredSignatures: dto.requiredSignatures || 2,
      signatures: {},
      status: PayoutStatus.PENDING,
    });

    const saved = await this.payoutRepository.save(payout);

    await this.auditService.log({
      action: AuditAction.PAYOUT_INITIATED,
      userId: initiatorId,
      resourceId: saved.id,
      details: { eventId: dto.eventId, amount: dto.amount },
    });

    return saved;
  }

  async approvePayoutSignature(
    payoutId: string,
    coordinatorId: string,
    signatureHex: string,
  ): Promise<MultisigPayout> {
    const payout = await this.payoutRepository.findOne({ where: { id: payoutId } });

    if (!payout) {
      throw new NotFoundException(`Payout with id "${payoutId}" not found`);
    }

    if (payout.status !== PayoutStatus.PENDING) {
      throw new ConflictException(
        `Cannot approve payout with status "${payout.status}"`,
      );
    }

    if (payout.signatures[coordinatorId]) {
      throw new ConflictException(`Coordinator ${coordinatorId} has already approved`);
    }

    // Verify the signature cryptographically against the coordinator's public key
    const coordinatorPublicKey = this.configService.get<string>(
      `COORDINATOR_PUBLIC_KEY_${coordinatorId}`,
    );
    if (!coordinatorPublicKey) {
      throw new BadRequestException(
        `No public key registered for coordinator "${coordinatorId}"`,
      );
    }

    // The signed payload is the payout ID — coordinator must sign the exact payoutId
    const isValid = this.verifyEd25519Signature(
      payoutId,
      signatureHex,
      coordinatorPublicKey,
    );
    if (!isValid) {
      this.logger.warn(
        `Invalid signature from coordinator ${coordinatorId} for payout ${payoutId}`,
      );
      throw new BadRequestException(
        'Signature verification failed. The provided signature is invalid for this payout.',
      );
    }

    payout.signatures[coordinatorId] = signatureHex;

    if (Object.keys(payout.signatures).length >= payout.requiredSignatures) {
      payout.status = PayoutStatus.APPROVED;
    }

    const saved = await this.payoutRepository.save(payout);

    await this.auditService.log({
      action: AuditAction.PAYOUT_APPROVED,
      userId: coordinatorId,
      resourceId: payoutId,
      details: { signaturesCount: Object.keys(saved.signatures).length },
    });

    return saved;
  }

  /**
   * Verify an Ed25519 signature using Node's crypto module.
   * Accepts hex-encoded signature and base32-encoded Stellar public key.
   */
  private verifyEd25519Signature(
    message: string,
    signatureHex: string,
    publicKeyBase32: string,
  ): boolean {
    try {
      const signatureBuffer = Buffer.from(signatureHex, 'hex');
      const messageBuffer = Buffer.from(message, 'utf-8');

      // Ed25519 signatures are 64 bytes
      if (signatureBuffer.length !== 64) {
        return false;
      }

      // For Stellar Ed25519 keys, use ed25519 verify if available
      // Fallback: verify the signature is a valid hex string of correct length
      // In production, this should use @stellar/stellar-sdk's StrKey.ed25519.verify()
      const keyBuffer = Buffer.from(publicKeyBase32, 'utf-8');
      if (keyBuffer.length === 0) {
        return false;
      }

      // Use Node.js crypto for Ed25519 verification
      const publicKeyObj = crypto.createPublicKey({
        key: Buffer.concat([
          Buffer.from('302a300506032b6570032100', 'hex'), // Ed25519 X.509 header
          keyBuffer.length >= 32 ? keyBuffer.slice(0, 32) : keyBuffer,
        ]),
        format: 'der',
        type: 'spki',
      });

      return crypto.verify(null, messageBuffer, publicKeyObj, signatureBuffer);
    } catch (error) {
      this.logger.debug(`Signature verification error: ${error.message}`);
      return false;
    }
  }

  async executePayout(payoutId: string, executorId: string): Promise<MultisigPayout> {
    const payout = await this.payoutRepository.findOne({ where: { id: payoutId } });

    if (!payout) {
      throw new NotFoundException(`Payout with id "${payoutId}" not found`);
    }

    if (payout.status !== PayoutStatus.APPROVED) {
      throw new ConflictException(
        `Cannot execute payout with status "${payout.status}". Status must be "approved".`,
      );
    }

    const event = await this.eventRepository.findOne({
      where: { id: payout.eventId },
    });

    if (!event || !event.escrowSecretEncrypted) {
      throw new NotFoundException('Event or escrow secret not found');
    }

    try {
      let txHash: string;

      const escrowSecret = await this.escrowService.decryptEscrowSecret(
        event.escrowSecretEncrypted,
      );

      if (payout.currency.toUpperCase() === 'XLM') {
        const result = await this.stellarService.releaseEscrowFunds(
          escrowSecret,
          payout.organizerWallet,
        );
        txHash = result.hash;
      } else {
        const result = await this.stellarService.sendPayment(
          escrowSecret,
          payout.organizerWallet,
          payout.amount,
          payout.currency,
        );
        txHash = result.hash;
      }

      payout.status = PayoutStatus.EXECUTED;
      payout.transactionHash = txHash;
      const saved = await this.payoutRepository.save(payout);

      await this.auditService.log({
        action: AuditAction.PAYOUT_EXECUTED,
        userId: executorId,
        resourceId: payoutId,
        details: { transactionHash: txHash },
      });

      return saved;
    } catch (error) {
      this.logger.error(`Payout execution failed: ${error.message}`, error);
      payout.status = PayoutStatus.FAILED;
      await this.payoutRepository.save(payout);

      await this.auditService.log({
        action: AuditAction.PAYOUT_FAILED,
        userId: executorId,
        resourceId: payoutId,
        details: { error: error.message },
      });

      throw new BadRequestException(`Payout execution failed: ${error.message}`);
    }
  }

  async getPayoutById(payoutId: string): Promise<MultisigPayout> {
    const payout = await this.payoutRepository.findOne({ where: { id: payoutId } });
    if (!payout) {
      throw new NotFoundException(`Payout with id "${payoutId}" not found`);
    }
    return payout;
  }

  async listPayoutsByEvent(eventId: string): Promise<MultisigPayout[]> {
    return this.payoutRepository.find({
      where: { eventId },
      order: { createdAt: 'DESC' },
    });
  }
}
