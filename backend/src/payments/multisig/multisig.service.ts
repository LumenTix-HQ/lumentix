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
