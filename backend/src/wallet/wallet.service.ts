import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Keypair } from '@stellar/stellar-sdk';
import Redis from 'ioredis';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { StellarService } from '../stellar/stellar.service';
import { REDIS_CLIENT } from '../common/redis/redis.provider';

const NONCE_TTL_SECONDS = 300; // 5 minutes

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly stellarService: StellarService,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1 — Issue challenge
  // ─────────────────────────────────────────────────────────────────────────

  async requestChallenge(publicKey: string): Promise<{ message: string }> {
    this.validatePublicKeyFormat(publicKey);

    const nonce = crypto.randomBytes(32).toString('hex');

    // Overwrite any existing nonce for this key; TTL ensures auto-expiry
    await this.redis.set(
      `wallet:nonce:${publicKey}`,
      nonce,
      'EX',
      NONCE_TTL_SECONDS,
    );

    const message = `Sign this message to link wallet: ${nonce}`;
    this.logger.log(`Challenge issued for ${publicKey}`);
    return { message };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2 — Verify signature & link wallet
  // ─────────────────────────────────────────────────────────────────────────

  async verifyAndLink(
    userId: string,
    publicKey: string,
    signature: string,
  ): Promise<Omit<User, 'passwordHash'>> {
    this.validatePublicKeyFormat(publicKey);

    const nonce = await this.redis.get(`wallet:nonce:${publicKey}`);

    if (!nonce) {
      throw new BadRequestException(
        'No active challenge found for this public key. Request a new challenge.',
      );
    }

    const message = `Sign this message to link wallet: ${nonce}`;
    const isValid = this.verifySignature(publicKey, message, signature);

    if (!isValid) {
      throw new UnauthorizedException('Invalid signature.');
    }

    // Consume nonce immediately — prevents replay attacks
    await this.redis.del(`wallet:nonce:${publicKey}`);

    const existingOwner = await this.usersRepository.findOne({
      where: { stellarPublicKey: publicKey },
    });

    if (existingOwner && existingOwner.id !== userId) {
      throw new ConflictException(
        'This Stellar public key is already linked to another account.',
      );
    }

    try {
      await this.stellarService.getAccount(publicKey);
    } catch {
      this.logger.warn(
        `Stellar account ${publicKey} not found on network (may be unfunded). Proceeding with link.`,
      );
    }

    return this.usersService.updateWallet(userId, publicKey);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private verifySignature(
    publicKey: string,
    message: string,
    signatureHex: string,
  ): boolean {
    try {
      const keypair = Keypair.fromPublicKey(publicKey);
      const messageBuffer = Buffer.from(message, 'utf8');
      const signatureBuffer = Buffer.from(signatureHex, 'hex');
      return keypair.verify(messageBuffer, signatureBuffer);
    } catch (err) {
      this.logger.warn(
        `Signature verification error: ${(err as Error).message}`,
      );
      return false;
    }
  }

  private validatePublicKeyFormat(publicKey: string): void {
    try {
      Keypair.fromPublicKey(publicKey);
    } catch {
      throw new BadRequestException('Invalid Stellar public key format.');
    }
  }
}
