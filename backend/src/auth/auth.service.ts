import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { WalletChallenge } from './entities/wallet-challenge.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { MailerService } from '../mailer/mailer.service';
import { verifySignature, generateNonce } from '../stellar/verify-signature.util';

const SALT = 10;
const REFRESH_TTL_DAYS = 30;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailerService: MailerService,
    private readonly auditService: AuditService,
    @InjectRepository(PasswordResetToken)
    private readonly passwordResetTokenRepository: Repository<PasswordResetToken>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(WalletChallenge)
    private readonly walletChallengeRepository: Repository<WalletChallenge>,
  ) {}

  async register(dto: RegisterDto): Promise<{ access_token: string; refresh_token: string }> {
    const user = await this.usersService.createUser({
      email: dto.email,
      password: dto.password,
      role: dto.role,
    });
    const { access_token } = this.signToken((user as any).id, (user as any).role);
    const refresh_token = await this.issueRefreshToken((user as any).id);
    return { access_token, refresh_token };
  }

  async login(dto: LoginDto): Promise<{ access_token: string; refresh_token: string }> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    const { access_token } = this.signToken(user.id, user.role);
    const refresh_token = await this.issueRefreshToken(user.id);
    return { access_token, refresh_token };
  }

  async refresh(rawToken: string): Promise<{ access_token: string; refresh_token: string }> {
    const record = await this.findValidRefreshToken(rawToken);
    record.revoked = true;
    await this.refreshTokenRepository.save(record);
    const user = await this.usersService.findById(record.userId);
    const { access_token } = this.signToken(record.userId, (user as any).role);
    const refresh_token = await this.issueRefreshToken(record.userId);
    return { access_token, refresh_token };
  }

  async logout(userId: string, rawToken: string): Promise<{ message: string }> {
    const record = await this.findValidRefreshToken(rawToken);
    if (record.userId !== userId) throw new UnauthorizedException();
    record.revoked = true;
    await this.refreshTokenRepository.save(record);
    return { message: 'Logged out successfully.' };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) return { message: 'If the email exists, password reset instructions have been sent.' };

    const rawSecret = crypto.randomBytes(32).toString('hex');
    const token = this.passwordResetTokenRepository.create({
      userId: user.id,
      tokenHash: '',
      expiresAt: new Date(Date.now() + 3600000),
      used: false,
    });
    const saved = await this.passwordResetTokenRepository.save(token);
    saved.tokenHash = await bcrypt.hash(rawSecret, SALT);
    await this.passwordResetTokenRepository.save(saved);

    const rawToken = `${saved.id}:${rawSecret}`;
    const base = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const resetUrl = `${base}/reset-password?token=${encodeURIComponent(rawToken)}`;
    await this.mailerService.send(
      user.email,
      'Lumentix Password Reset',
      `<p>Click to reset: <a href="${resetUrl}">Reset your password</a></p>`,
    );
    return { message: 'If the email exists, password reset instructions have been sent.' };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const [tokenId, secret] = dto.token.split(':');
    if (!tokenId || !secret) throw new BadRequestException('Invalid password reset token.');
    const record = await this.passwordResetTokenRepository.findOne({ where: { id: tokenId } });
    if (!record) throw new BadRequestException('Invalid password reset token.');
    if (record.used) throw new BadRequestException('Password reset token has already been used.');
    if (record.expiresAt.getTime() <= Date.now()) throw new BadRequestException('Password reset token has expired.');
    if (!await bcrypt.compare(secret, record.tokenHash)) throw new BadRequestException('Invalid password reset token.');
    await this.usersService.updatePassword(record.userId, dto.newPassword);
    record.used = true;
    await this.passwordResetTokenRepository.save(record);
    return { message: 'Password has been reset successfully.' };
  }

  async findOrCreateGoogleUser(googleUser: {
    googleId: string;
    email: string;
    displayName?: string;
  }): Promise<{ access_token: string; refresh_token: string }> {
    let user = await this.usersService.findByGoogleId(googleUser.googleId);
    if (!user) {
      user = await this.usersService.findByEmail(googleUser.email);
      if (user) {
        await this.usersService.updateGoogleId(user.id, googleUser.googleId);
      } else {
        user = await this.usersService.createGoogleUser({
          email: googleUser.email,
          googleId: googleUser.googleId,
          displayName: googleUser.displayName,
        });
      }
    }
    const { access_token } = this.signToken((user as any).id, (user as any).role);
    const refresh_token = await this.issueRefreshToken((user as any).id);
    return { access_token, refresh_token };
  }

  // ─── Wallet Challenge ──────────────────────────────────────────────────────

  async generateWalletChallenge(userId: string): Promise<{ nonce: string; message: string }> {
    const nonce = generateNonce();
    const user = await this.usersService.findById(userId);
    if (!user) throw new BadRequestException('User not found');

    const challenge = this.walletChallengeRepository.create({
      userId,
      nonce,
      used: false,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });
    await this.walletChallengeRepository.save(challenge);

    const message = `Sign this message to link your Stellar wallet to Lumentix.\nNonce: ${nonce}`;
    return { nonce, message };
  }

  async verifyWalletChallenge(
    userId: string,
    nonce: string,
    signature: string,
    publicKey: string,
  ): Promise<{ linked: boolean; stellarPublicKey: string }> {
    const challenge = await this.walletChallengeRepository.findOne({
      where: { nonce, userId, used: false },
    });

    if (!challenge) throw new BadRequestException('Invalid or expired nonce');
    if (challenge.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Nonce has expired. Please request a new one.');
    }

    const message = `Sign this message to link your Stellar wallet to Lumentix.\nNonce: ${nonce}`;
    const isValid = verifySignature(publicKey, signature, message);
    if (!isValid) throw new UnauthorizedException('Invalid signature. Please try again.');

    challenge.used = true;
    await this.walletChallengeRepository.save(challenge);
    await this.usersService.updateWallet(userId, publicKey);

    return { linked: true, stellarPublicKey: publicKey };
  }

  // ─── Email Verification ─────────────────────────────────────────────────────

  async sendVerificationEmail(userId: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new BadRequestException('User not found');
    if (user.emailVerified) throw new BadRequestException('Email is already verified');

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, SALT);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.usersService.update(userId, {
      emailVerificationToken: tokenHash,
      emailVerificationTokenExpiresAt: expiresAt,
    });

    const baseUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const verifyUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(rawToken)}&userId=${encodeURIComponent(userId)}`;

    await this.mailerService.send(
      user.email,
      'Verify your Lumentix email address',
      `<p>Click the link below to verify your email address:</p>
       <p><a href="${verifyUrl}">Verify Email</a></p>
       <p>This link expires in 24 hours.</p>`,
    );
  }

  async verifyEmail(userId: string, rawToken: string): Promise<{ verified: boolean }> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new BadRequestException('User not found');
    if (user.emailVerified) return { verified: true };

    if (!user.emailVerificationToken || !user.emailVerificationTokenExpiresAt) {
      throw new BadRequestException('No verification token found. Request a new one.');
    }
    if (user.emailVerificationTokenExpiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Verification token has expired. Request a new one.');
    }

    const isValid = await bcrypt.compare(rawToken, user.emailVerificationToken);
    if (!isValid) throw new BadRequestException('Invalid verification token.');

    await this.usersService.update(userId, {
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationTokenExpiresAt: null,
    });

    return { verified: true };
  }

  async resendVerificationEmail(userId: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new BadRequestException('User not found');
    if (user.emailVerified) throw new BadRequestException('Email is already verified');
    await this.sendVerificationEmail(userId);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private signToken(userId: string, role: string): { access_token: string } {
    return { access_token: this.jwtService.sign({ sub: userId, role }) };
  }

  private async issueRefreshToken(userId: string): Promise<string> {
    const raw = crypto.randomBytes(48).toString('hex');
    const tokenHash = await bcrypt.hash(raw, SALT);
    const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 86400000);
    const saved = await this.refreshTokenRepository.save(
      this.refreshTokenRepository.create({ userId, tokenHash, expiresAt, revoked: false }),
    );
    return `${saved.id}:${raw}`;
  }

  /**
   * Parses an `id:secret` refresh token, verifies it is not revoked or expired.
   *
   * Replay attack detection: if the token is already marked revoked, all active
   * sessions for that user are revoked and an audit record is written before
   * throwing — this limits the blast radius of a stolen refresh token.
   */
  private async findValidRefreshToken(rawToken: string): Promise<RefreshToken> {
    const [tokenId, secret] = rawToken.split(':');
    if (!tokenId || !secret) throw new UnauthorizedException('Invalid refresh token.');

    const record = await this.refreshTokenRepository.findOne({ where: { id: tokenId } });
    if (!record) throw new UnauthorizedException('Invalid refresh token.');

    if (record.revoked) {
      await this.refreshTokenRepository.update(
        { userId: record.userId, revoked: false },
        { revoked: true },
      );
      await this.auditService.log({
        action: AuditAction.SUSPICIOUS_REFRESH_REPLAY,
        userId: record.userId,
        resourceId: tokenId,
        meta: { reason: 'Revoked refresh token was replayed' },
      });
      throw new UnauthorizedException(
        'Session invalidated due to suspicious activity. Please log in again.',
      );
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token has expired.');
    }

    const isValid = await bcrypt.compare(secret, record.tokenHash);
    if (!isValid) throw new UnauthorizedException('Invalid refresh token.');

    return record;
  }
}
