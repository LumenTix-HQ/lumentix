import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class MfaService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * Generate TOTP secret and QR code for initial MFA setup
   */
  async generateTotpSecret(user: User): Promise<{
    secret: string;
    qrCode: string;
    manualEntryKey: string;
  }> {
    const secret = speakeasy.generateSecret({
      name: `LumenTix (${user.email})`,
      issuer: 'LumenTix',
      length: 32,
    });

    const qrCode = await QRCode.toDataURL(secret.otpauth_url);

    return {
      secret: secret.base32,
      qrCode,
      manualEntryKey: secret.base32,
    };
  }

  /**
   * Verify TOTP token and enable MFA
   */
  async enableTotpMfa(
    user: User,
    totpToken: string,
    totpSecret: string,
  ): Promise<{ backupCodes: string[] }> {
    const isValidToken = speakeasy.totp.verify({
      secret: totpSecret,
      encoding: 'base32',
      token: totpToken,
      window: 2,
    });

    if (!isValidToken) {
      throw new BadRequestException('Invalid TOTP token');
    }

    // Generate backup codes for account recovery
    const backupCodes = this.generateBackupCodes();

    // Update user with MFA config
    user.mfaConfig = {
      enabled: true,
      method: 'totp',
      totpSecret, // In production, encrypt this value
      verifiedAt: new Date().toISOString(),
    };

    // Store backup codes (hashed in production)
    user.mfaConfig.backupCodes = backupCodes;

    await this.userRepository.save(user);

    return { backupCodes };
  }

  /**
   * Enable SMS-based MFA
   */
  async enableSmsMfa(
    user: User,
    phoneNumber: string,
  ): Promise<{ verificationCodeSent: boolean }> {
    // Validate phone number format
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phoneNumber)) {
      throw new BadRequestException('Invalid phone number format');
    }

    // Update user with MFA config
    user.mfaConfig = {
      enabled: true,
      method: 'sms',
      phoneNumber, // In production, encrypt this value
      verifiedAt: new Date().toISOString(),
    };

    await this.userRepository.save(user);

    // In production, send actual SMS verification code via Twilio/etc
    // For now, this is a placeholder
    return { verificationCodeSent: true };
  }

  /**
   * Verify TOTP token during login
   */
  async verifyTotpToken(user: User, token: string): Promise<boolean> {
    if (!user.mfaConfig?.enabled || user.mfaConfig?.method !== 'totp') {
      throw new BadRequestException('TOTP MFA not enabled for this user');
    }

    const secret = user.mfaConfig.totpSecret;
    if (!secret) {
      throw new UnauthorizedException('MFA secret not found');
    }

    // Check if token is a backup code
    if (
      user.mfaConfig.backupCodes &&
      user.mfaConfig.backupCodes.includes(token)
    ) {
      // Remove used backup code
      user.mfaConfig.backupCodes = user.mfaConfig.backupCodes.filter(
        (code) => code !== token,
      );
      await this.userRepository.save(user);
      return true;
    }

    // Verify TOTP token
    const isValidToken = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2,
    });

    return isValidToken;
  }

  /**
   * Verify SMS token during login
   */
  async verifySmsToken(user: User, token: string): Promise<boolean> {
    if (!user.mfaConfig?.enabled || user.mfaConfig?.method !== 'sms') {
      throw new BadRequestException('SMS MFA not enabled for this user');
    }

    // In production, verify against sent code stored in cache/DB with TTL
    // This is a placeholder - actual implementation depends on SMS provider
    const isValid = token.length === 6 && /^\d+$/.test(token);

    return isValid;
  }

  /**
   * Create MFA session after successful verification
   */
  async createMfaSession(
    user: User,
    method: 'totp' | 'sms',
  ): Promise<string> {
    const sessionId = this.generateSessionId();

    if (!user.mfaSessions) {
      user.mfaSessions = [];
    }

    user.mfaSessions.push({
      sessionId,
      createdAt: new Date().toISOString(),
      verifiedAt: new Date().toISOString(),
      method,
    });

    // Keep only last 10 sessions
    if (user.mfaSessions.length > 10) {
      user.mfaSessions = user.mfaSessions.slice(-10);
    }

    await this.userRepository.save(user);

    return sessionId;
  }

  /**
   * Disable MFA for user
   */
  async disableMfa(user: User): Promise<void> {
    user.mfaConfig = null;
    user.mfaSessions = null;
    await this.userRepository.save(user);
  }

  /**
   * Get MFA status for user
   */
  async getMfaStatus(user: User): Promise<{
    enabled: boolean;
    method: 'totp' | 'sms' | null;
    verifiedAt: string | null;
    backupCodesRemaining: number;
  }> {
    return {
      enabled: user.mfaConfig?.enabled || false,
      method: user.mfaConfig?.method || null,
      verifiedAt: user.mfaConfig?.verifiedAt || null,
      backupCodesRemaining: user.mfaConfig?.backupCodes?.length || 0,
    };
  }

  /**
   * Generate array of backup codes
   */
  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const code = Math.random()
        .toString(36)
        .substring(2, 10)
        .toUpperCase();
      codes.push(code);
    }
    return codes;
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `mfa_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Regenerate backup codes (requires MFA verification first)
   */
  async regenerateBackupCodes(user: User): Promise<string[]> {
    if (!user.mfaConfig?.enabled) {
      throw new BadRequestException('MFA not enabled for this user');
    }

    const backupCodes = this.generateBackupCodes();
    user.mfaConfig.backupCodes = backupCodes;

    await this.userRepository.save(user);

    return backupCodes;
  }
}
