import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
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

const BCRYPT_SALT_ROUNDS = 10;

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
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.signToken(user.id, user.role);
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      // Always respond 200 to avoid user enumeration.
      return {
        message:
          'If the email exists, password reset instructions have been sent.',
      };
    }

    const rawSecret = crypto.randomBytes(32).toString('hex');
    const token = this.passwordResetTokenRepository.create({
      userId: user.id,
      tokenHash: '',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      used: false,
    });

    const savedToken = await this.passwordResetTokenRepository.save(token);

    const hashedSecret = await bcrypt.hash(rawSecret, BCRYPT_SALT_ROUNDS);
    savedToken.tokenHash = hashedSecret;
    await this.passwordResetTokenRepository.save(savedToken);

    const rawToken = `${savedToken.id}:${rawSecret}`;

    const frontendBaseUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    const resetUrl = `${frontendBaseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

    const html = `
      <p>You requested a password reset. Click below to set a new password:</p>
      <p><a href="${resetUrl}">Reset your password</a></p>
      <p>If you did not request this, please ignore this email.</p>
    `;

    await this.mailerService.send(user.email, 'Lumentix Password Reset', html);

    return {
      message:
        'If the email exists, password reset instructions have been sent.',
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const [tokenId, secret] = dto.token.split(':');
    if (!tokenId || !secret) {
      throw new BadRequestException('Invalid password reset token.');
    }

    const tokenRecord = await this.passwordResetTokenRepository.findOne({
      where: { id: tokenId },
    });
    if (!tokenRecord) {
      throw new BadRequestException('Invalid password reset token.');
    }

    if (tokenRecord.used) {
      throw new BadRequestException(
        'Password reset token has already been used.',
      );
    }

    if (tokenRecord.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Password reset token has expired.');
    }

    const match = await bcrypt.compare(secret, tokenRecord.tokenHash);
    if (!match) {
      throw new BadRequestException('Invalid password reset token.');
    }

    await this.usersService.updatePassword(tokenRecord.userId, dto.newPassword);

    tokenRecord.used = true;
    await this.passwordResetTokenRepository.save(tokenRecord);

    return { message: 'Password has been reset successfully.' };
  }

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
