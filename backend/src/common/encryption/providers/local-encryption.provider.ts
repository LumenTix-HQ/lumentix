import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EncryptionProvider } from '../interfaces/encryption-provider.interface';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM

/**
 * Derive a fixed-length 32-byte key from the provided secret using SHA-256.
 * This allows arbitrary-length env var values to be used safely.
 */
function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Local AES-256-GCM encryption provider.
 * Compatible with the existing encrypted escrow secret format ("iv:tag:ciphertext").
 * Uses ESCROW_ENCRYPTION_SECRET from config.
 *
 * This is the default provider for dev/test environments.
 * Swap via DI to use AWS KMS, HashiCorp Vault, or other KMS.
 */
@Injectable()
export class LocalEncryptionProvider implements EncryptionProvider {
  private readonly secret: string;

  constructor(private readonly configService: ConfigService) {
    this.secret = this.configService.get<string>('ESCROW_ENCRYPTION_SECRET') ?? '';
    if (!this.secret) {
      throw new Error('ESCROW_ENCRYPTION_SECRET is not configured');
    }
  }

  /**
   * Encrypt plaintext using AES-256-GCM.
   * Returns colon-delimited string: "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
   */
  encrypt(plaintext: string): string {
    const key = deriveKey(this.secret);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      iv.toString('hex'),
      authTag.toString('hex'),
      ciphertext.toString('hex'),
    ].join(':');
  }

  /**
   * Decrypt a value produced by `encrypt`.
   * Throws if the ciphertext has been tampered with (GCM auth tag mismatch).
   */
  decrypt(encrypted: string): string {
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted value format.');
    }

    const [ivHex, authTagHex, ciphertextHex] = parts;
    const key = deriveKey(this.secret);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }
}
