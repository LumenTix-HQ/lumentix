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
import { verifySignature } from '../stellar/verify-signature.util';
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
    const isValid = verifySignature(publicKey, signature, message);

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

  private validatePublicKeyFormat(publicKey: string): void {
    try {
      Keypair.fromPublicKey(publicKey);
    } catch {
      throw new BadRequestException('Invalid Stellar public key format.');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WalletConnect session management (#1533)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Initiate a WalletConnect session for a given public key.
   *
   * Generates a unique session ID and pairing topic, stores them in Redis
   * with a 5-minute TTL, and returns them so the frontend can display the
   * pairing URI / QR code.
   */
  async initiateWalletConnectSession(
    publicKey: string,
  ): Promise<{ sessionId: string; pairingTopic: string }> {
    this.validatePublicKeyFormat(publicKey);

    const sessionId = crypto.randomUUID();
    const pairingTopic = crypto.randomBytes(16).toString('hex');

    const sessionData = JSON.stringify({
      publicKey,
      pairingTopic,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    // Store with 5-minute TTL
    await this.redis.set(
      `walletconnect:session:${sessionId}`,
      sessionData,
      'EX',
      NONCE_TTL_SECONDS,
    );

    this.logger.log(`WalletConnect session initiated: ${sessionId} for ${publicKey}`);

    return { sessionId, pairingTopic };
  }

  /**
   * Approve a pending WalletConnect session.
   *
   * Validates the session exists and is still pending, then marks it as
   * active. The public key from the session is returned so the caller can
   * proceed with wallet linking.
   */
  async approveWalletConnectSession(
    sessionId: string,
    publicKey: string,
    topic: string,
  ): Promise<{ success: boolean; publicKey: string }> {
    const raw = await this.redis.get(`walletconnect:session:${sessionId}`);
    if (!raw) {
      throw new BadRequestException(
        'WalletConnect session not found or has expired. Please initiate a new session.',
      );
    }

    const session = JSON.parse(raw) as {
      publicKey: string;
      pairingTopic: string;
      status: string;
    };

    if (session.status !== 'pending') {
      throw new BadRequestException('WalletConnect session has already been approved or disconnected.');
    }

    if (session.pairingTopic !== topic) {
      throw new BadRequestException('Pairing topic mismatch.');
    }

    this.validatePublicKeyFormat(publicKey);

    // Mark session as active, extend TTL to 30 minutes
    const updated = JSON.stringify({ ...session, status: 'active', publicKey });
    await this.redis.set(`walletconnect:session:${sessionId}`, updated, 'EX', 1800);

    this.logger.log(`WalletConnect session approved: ${sessionId}`);

    return { success: true, publicKey };
  }

  /**
   * Disconnect an active WalletConnect session.
   *
   * Removes the session from Redis so it can no longer be used.
   */
  async disconnectWalletConnectSession(
    sessionId: string,
    publicKey: string,
  ): Promise<{ success: boolean }> {
    const raw = await this.redis.get(`walletconnect:session:${sessionId}`);

    if (raw) {
      const session = JSON.parse(raw) as { publicKey: string };
      if (session.publicKey !== publicKey) {
        throw new BadRequestException('Public key does not match the session.');
      }
    }

    await this.redis.del(`walletconnect:session:${sessionId}`);
    this.logger.log(`WalletConnect session disconnected: ${sessionId}`);

    return { success: true };
  }
}
