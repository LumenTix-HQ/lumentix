import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';

import { encrypt, decrypt } from './encryption.util';
import { Event, EventStatus } from 'src/events/entities/event.entity';
import { AuditService } from 'src/audit/audit.service';
import { AuditAction } from 'src/audit/entities/audit-log.entity';
import { StellarService } from 'src/stellar';

/** System user ID used in audit logs for automated escrow actions */
const SYSTEM_USER_ID = 'system';

@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);
  private readonly encryptionSecret: string;
  private readonly funderSecret: string;

  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    private readonly stellarService: StellarService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {
    this.encryptionSecret =
      this.configService.get<string>('ESCROW_ENCRYPTION_SECRET') ?? '';
    this.funderSecret =
      this.configService.get<string>('ESCROW_FUNDER_SECRET') ?? '';

    if (!this.encryptionSecret || !this.funderSecret) {
      this.logger.warn(
        'ESCROW_ENCRYPTION_SECRET or ESCROW_FUNDER_SECRET is not set.',
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Escrow creation — called when an event is published
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Generate and fund a dedicated escrow account for the given event.
   * The escrow secret is AES-256-GCM encrypted before being stored.
   * The column is marked `select: false` so it never appears in queries
   * unless explicitly selected.
   */
  async createEscrow(eventId: string): Promise<string> {
    const event = await this.getEventWithEscrow(eventId);

    if (event.escrowPublicKey) {
      this.logger.warn(
        `Escrow already exists for event ${eventId}: ${event.escrowPublicKey}`,
      );
      return event.escrowPublicKey;
    }

    if (event.status !== EventStatus.PUBLISHED) {
      throw new BadRequestException(
        `Cannot create escrow for event with status "${event.status}". Event must be published.`,
      );
    }

    // 1. Generate keypair (no network call yet)
    const { publicKey, secret } = this.stellarService.generateEscrowKeypair();

    // 2. Fund the new account on-chain via StellarService
    try {
      await this.stellarService.fundEscrowAccount(this.funderSecret, publicKey);
    } catch (err) {
      this.logger.error(`Failed to fund escrow account ${publicKey}`, err);
      throw new InternalServerErrorException(
        'Failed to fund escrow account on the Stellar network.',
      );
    }

    // 3. Encrypt the secret before storing — private key never persisted in plain text
    const escrowSecretEncrypted = encrypt(secret, this.encryptionSecret);

    // 4. Persist to event
    await this.eventRepository
      .createQueryBuilder()
      .update(Event)
      .set({ escrowPublicKey: publicKey, escrowSecretEncrypted })
      .where('id = :id', { id: eventId })
      .execute();

    await this.auditService.log({
      action: AuditAction.ESCROW_RELEASED, // reuse closest action; extend enum for ESCROW_CREATED if desired
      userId: SYSTEM_USER_ID,
      resourceId: eventId,
      meta: { escrowPublicKey: publicKey, eventId },
    });

    this.logger.log(
      `Escrow created for event ${eventId}: publicKey=${publicKey}`,
    );

    return publicKey;
  }

  /**
   * Decrypt the AES-256-GCM encrypted escrow secret stored on the Event entity.
   * Format expected: "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
   *
   * @param encryptedSecret  The value of event.escrowSecretEncrypted
   * @returns                The plaintext Stellar secret key
   */

  async decryptEscrowSecret(encryptedSecret: string): Promise<string> {
    // Delegate to your existing internal decrypt logic.
    // Rename/adjust if your method is called something else.
    return this.decrypt(encryptedSecret);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Release funds — called when event is completed
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Transfer the escrow balance to the organizer's Stellar wallet.
   * Validates event is COMPLETED before releasing.
   *
   * @param eventId         The event whose escrow to release
   * @param organizerWallet Organizer's Stellar public key (destination)
   */
  async releaseEscrow(
    eventId: string,
    organizerWallet: string,
  ): Promise<{ txHash: string; amount: string }> {
    const event = await this.getEventWithEscrow(eventId);

    // 1. Validate event is completed
    if (event.status !== EventStatus.COMPLETED) {
      throw new BadRequestException(
        `Cannot release escrow for event with status "${event.status}". Event must be completed.`,
      );
    }

    // 2. Validate escrow account exists on this event
    if (!event.escrowPublicKey || !event.escrowSecretEncrypted) {
      throw new BadRequestException(
        `No escrow account found for event "${eventId}".`,
      );
    }

    // 3. Check balance before releasing
    const balance = await this.stellarService.getXlmBalance(
      event.escrowPublicKey,
    );

    this.logger.log(
      `Releasing escrow for event ${eventId}: balance=${balance} XLM → ${organizerWallet}`,
    );

    // 4. Decrypt secret and release funds via StellarService (account merge)
    let escrowSecret: string;
    try {
      escrowSecret = decrypt(
        event.escrowSecretEncrypted,
        this.encryptionSecret,
      );
    } catch {
      throw new InternalServerErrorException(
        'Failed to decrypt escrow credentials.',
      );
    }

    let txResponse: Awaited<ReturnType<StellarService['releaseEscrowFunds']>>;
    try {
      txResponse = await this.stellarService.releaseEscrowFunds(
        escrowSecret,
        organizerWallet,
      );
    } catch (err) {
      this.logger.error(`Failed to release escrow for event ${eventId}`, err);
      throw new InternalServerErrorException(
        'Failed to release escrow funds on the Stellar network.',
      );
    }

    // 5. Clear escrow credentials from DB after successful release
    await this.eventRepository
      .createQueryBuilder()
      .update(Event)
      .set({ escrowSecretEncrypted: null })
      .where('id = :id', { id: eventId })
      .execute();

    const txHash = String(txResponse.hash);

    await this.auditService.log({
      action: AuditAction.ESCROW_RELEASED,
      userId: SYSTEM_USER_ID,
      resourceId: eventId,
      meta: {
        txHash,
        amount: balance,
        escrowPublicKey: event.escrowPublicKey,
        organizerWallet,
      },
    });

    this.logger.log(`Escrow released for event ${eventId}: txHash=${txHash}`);

    return { txHash, amount: balance };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cancellation — trigger refund flow
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Called when an event is cancelled.
   * Returns the escrow public key and balance so the Refunds module
   * can issue individual refunds back to ticket holders.
   */
  async handleCancellation(
    eventId: string,
  ): Promise<{ escrowPublicKey: string; balance: string }> {
    const event = await this.getEventWithEscrow(eventId);

    if (event.status !== EventStatus.CANCELLED) {
      throw new BadRequestException(
        `Cannot handle cancellation for event with status "${event.status}".`,
      );
    }

    if (!event.escrowPublicKey) {
      throw new BadRequestException(
        `No escrow account found for event "${eventId}".`,
      );
    }

    const balance = await this.stellarService.getXlmBalance(
      event.escrowPublicKey,
    );

    await this.auditService.log({
      action: AuditAction.EVENT_CANCELLED,
      userId: SYSTEM_USER_ID,
      resourceId: eventId,
      meta: { escrowPublicKey: event.escrowPublicKey, balance },
    });

    this.logger.log(
      `Cancellation escrow info for event ${eventId}: balance=${balance}`,
    );

    return { escrowPublicKey: event.escrowPublicKey, balance };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Load event and explicitly select the encrypted secret column
   * (it is marked `select: false` on the entity to prevent accidental exposure).
   */
  private async getEventWithEscrow(
    eventId: string,
  ): Promise<Event & { escrowSecretEncrypted: string | null }> {
    const event = await this.eventRepository
      .createQueryBuilder('event')
      .addSelect('event.escrowSecretEncrypted')
      .where('event.id = :id', { id: eventId })
      .getOne();

    if (!event) {
      throw new BadRequestException(`Event "${eventId}" not found.`);
    }

    return event as Event & { escrowSecretEncrypted: string | null };
  }
}
