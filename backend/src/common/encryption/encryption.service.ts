import { Inject, Injectable } from '@nestjs/common';
import { EncryptionProvider } from './interfaces/encryption-provider.interface';

export const ENCRYPTION_PROVIDER = 'ENCRYPTION_PROVIDER';

/**
 * EncryptionService is a thin wrapper around an EncryptionProvider.
 *
 * By default, LocalEncryptionProvider is used (AES-256-GCM).
 * In production, swap the provider via NestJS DI to use AWS KMS,
 * HashiCorp Vault, or any other KMS-compatible solution —
 * without changing any service-level code.
 */
@Injectable()
export class EncryptionService {
  constructor(
    @Inject(ENCRYPTION_PROVIDER)
    private readonly provider: EncryptionProvider,
  ) {}

  encrypt(plaintext: string): string {
    return this.provider.encrypt(plaintext);
  }

  decrypt(ciphertext: string): string {
    return this.provider.decrypt(ciphertext);
  }
}
