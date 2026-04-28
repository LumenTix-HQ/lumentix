import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { MailerService } from '../mailer/mailer.service';

const SALT = 10;
const REFRESH_TTL_DAYS = 30;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailerService: MailerService,
    @InjectRepository(PasswordResetToken)
    private readonly passwordResetTokenRepository: Repository<PasswordResetToken>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
  ) {}

  async register(dto: RegisterDto): Promise<{ access_token: string }> {
    const user = await this.usersService.createUser({ email: dto.email, password: dto.password, role: dto.role });
    return this.signToken(user.id, user.role);
  }

  async login(dto: LoginDto): Promise<{ access_token: string; refresh_token: string }> {
  async register(dto: RegisterDto): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.usersService.createUser({
      email: dto.email,
      password: dto.password,
      role: dto.role,
    });

    return this.signToken(user.id, user.role);
  }

  async login(dto: LoginDto): Promise<{ accessToken: string; refreshToken: string }> {
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
    const token = this.passwordResetTokenRepository.create({ userId: user.id, tokenHash: '', expiresAt: new Date(Date.now() + 3600000), used: false });
    const saved = await this.passwordResetTokenRepository.save(token);
    saved.tokenHash = await bcrypt.hash(rawSecret, SALT);
    await this.passwordResetTokenRepository.save(saved);

    const rawToken = `${saved.id}:${rawSecret}`;
    const base = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const resetUrl = `${base}/reset-password?token=${encodeURIComponent(rawToken)}`;
    await this.mailerService.send(user.email, 'Lumentix Password Reset',
      `<p>Click to reset: <a href="${resetUrl}">Reset your password</a></p>`);
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

  private signToken(userId: string, role: string): { access_token: string } {
    return { access_token: this.jwtService.sign({ sub: userId, role }) };
  }

  private async issueRefreshToken(userId: string): Promise<string> {
    const raw = crypto.randomBytes(48).toString('hex');
    const tokenHash = await bcrypt.hash(raw, SALT);
    const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 86400000);
    await this.refreshTokenRepository.save(this.refreshTokenRepository.create({ userId, tokenHash, expiresAt, revoked: false }));
    return raw;
  }

  private async findValidRefreshToken(rawToken: string): Promise<RefreshToken> {
    const candidates = await this.refreshTokenRepository.find({ where: { revoked: false } });
    for (const r of candidates) {
      if (r.expiresAt.getTime() <= Date.now()) continue;
      if (await bcrypt.compare(rawToken, r.tokenHash)) return r;
    }
    throw new UnauthorizedException('Invalid or expired refresh token.');
  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const parts = refreshToken.split(':');
    if (parts.length !== 2) {
      throw new UnauthorizedException('Invalid refresh token format');
    }
    const [tokenId, secret] = parts;

    const tokenRecord = await this.refreshTokenRepository.findOne({ where: { id: tokenId } });
    if (!tokenRecord) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (tokenRecord.revoked) {
      throw new UnauthorizedException('Refresh token is revoked');
    }

    if (tokenRecord.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token is expired');
    }

    const isMatch = await bcrypt.compare(secret, tokenRecord.token);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Revoke old token
    tokenRecord.revoked = true;
    await this.refreshTokenRepository.save(tokenRecord);

    const user = await this.usersService.findById(tokenRecord.userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.signToken(user.id, user.role);
  }

  async logout(refreshToken: string): Promise<void> {
    const parts = refreshToken.split(':');
    if (parts.length !== 2) {
      throw new UnauthorizedException('Invalid refresh token format');
    }
    const [tokenId, secret] = parts;

    const tokenRecord = await this.refreshTokenRepository.findOne({ where: { id: tokenId } });
    if (!tokenRecord) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const isMatch = await bcrypt.compare(secret, tokenRecord.token);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    tokenRecord.revoked = true;
    await this.refreshTokenRepository.save(tokenRecord);
  }

  private async signToken(userId: string, role: string): Promise<{ accessToken: string; refreshToken: string }> {
    const payload: { sub: string; role: string } = { sub: userId, role };
    const accessToken = this.jwtService.sign(payload);

    const rawSecret = crypto.randomBytes(32).toString('hex');
    const hashedSecret = await bcrypt.hash(rawSecret, BCRYPT_SALT_ROUNDS);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    const tokenRecord = this.refreshTokenRepository.create({
      userId,
      token: hashedSecret,
      expiresAt,
    });
    const savedToken = await this.refreshTokenRepository.save(tokenRecord);

    const refreshToken = `${savedToken.id}:${rawSecret}`;

    return { accessToken, refreshToken };
  }
}
