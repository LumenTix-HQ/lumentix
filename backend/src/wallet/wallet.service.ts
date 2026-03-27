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
import { UserWallet } from './entities/user-wallet.entity';

const NONCE_TTL_SECONDS = 300; // 5 minutes

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly stellarService: StellarService,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(UserWallet)
    private readonly userWalletsRepository: Repository<UserWallet>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Issue 157 — GET /wallet/status
  // ─────────────────────────────────────────────────────────────────────────

  async getWalletStatus(userId: string): Promise<{ linked: boolean; publicKey: string | null }> {
    const user = await this.usersService.findById(userId);
    return {
      linked: !!user.stellarPublicKey,
      publicKey: user.stellarPublicKey ?? null,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Issue 157 — DELETE /wallet/unlink
  // ─────────────────────────────────────────────────────────────────────────

  async unlinkWallet(userId: string): Promise<{ unlinked: boolean }> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user?.stellarPublicKey) {
      throw new BadRequestException('No wallet is currently linked');
    }
    user.stellarPublicKey = null;
    await this.usersRepository.save(user);

    // Remove all UserWallet records for this user
    await this.userWalletsRepository.delete({ userId });

    return { unlinked: true };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Issue 158 — GET /wallet/list
  // ─────────────────────────────────────────────────────────────────────────

  async listWallets(userId: string): Promise<UserWallet[]> {
    return this.userWalletsRepository.find({ where: { userId } });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Issue 158 — PATCH /wallet/:publicKey/primary
  // ─────────────────────────────────────────────────────────────────────────

  async setPrimaryWallet(userId: string, publicKey: string): Promise<UserWallet> {
    const wallet = await this.userWalletsRepository.findOne({
      where: { userId, publicKey },
    });
    if (!wallet) {
      throw new BadRequestException('Wallet not found for this user');
    }

    // Reset all user's wallets to non-primary
    await this.userWalletsRepository.update({ userId }, { isPrimary: false });

    // Set the selected wallet as primary
    wallet.isPrimary = true;
    await this.userWalletsRepository.save(wallet);

    // Keep User.stellarPublicKey in sync with primary wallet
    await this.usersRepository.update({ id: userId }, { stellarPublicKey: publicKey });

    return wallet;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Issue 158 — DELETE /wallet/:publicKey
  // ─────────────────────────────────────────────────────────────────────────

  async removeWallet(userId: string, publicKey: string): Promise<{ removed: boolean }> {
    const wallet = await this.userWalletsRepository.findOne({
      where: { userId, publicKey },
    });
    if (!wallet) {
      throw new BadRequestException('Wallet not found for this user');
    }

    const walletCount = await this.userWalletsRepository.count({ where: { userId } });
    if (wallet.isPrimary && walletCount > 1) {
      throw new BadRequestException(
        'Cannot delete the primary wallet while other wallets exist. Set a different primary wallet first.',
      );
    }

    await this.userWalletsRepository.remove(wallet);

    // If the removed wallet was the primary, clear User.stellarPublicKey
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (user?.stellarPublicKey === publicKey) {
      const nextPrimary = await this.userWalletsRepository.findOne({
        where: { userId, isPrimary: true },
      });
      user.stellarPublicKey = nextPrimary?.publicKey ?? null;
      await this.usersRepository.save(user);
    }

    return { removed: true };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Issue 159 — Transaction history
  // ─────────────────────────────────────────────────────────────────────────

  async getTransactionHistory(
    publicKey: string,
    cursor?: string,
    limit: number = 10,
  ) {
    const cappedLimit = Math.min(Number(limit), 50);
    const result = await this.stellarService.getAccountTransactions(publicKey, cursor, cappedLimit);

    const records = result.records ?? [];
    const nextCursor =
      records.length > 0 ? records[records.length - 1].paging_token : null;

    return {
      transactions: records,
      nextCursor,
    };
  }

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
  // STEP 2 — Verify signature & link wallet (Issue 157 improved error + Issue 158 multi-wallet)
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
        'Challenge has expired or was never issued. Request a new challenge via POST /wallet/challenge.',
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

    // Issue 158: create UserWallet record if not already present
    const existingWallet = await this.userWalletsRepository.findOne({
      where: { userId, publicKey },
    });

    if (!existingWallet) {
      const walletCount = await this.userWalletsRepository.count({ where: { userId } });
      const isPrimary = walletCount === 0;

      const userWallet = this.userWalletsRepository.create({
        userId,
        publicKey,
        isPrimary,
      });
      await this.userWalletsRepository.save(userWallet);

      // Keep User.stellarPublicKey pointing at the primary wallet
      if (isPrimary) {
        await this.usersRepository.update({ id: userId }, { stellarPublicKey: publicKey });
      }
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
